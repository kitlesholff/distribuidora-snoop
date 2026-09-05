(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const core = window.CashClosingCore, api = window.CashClosingStore;
  const view = $('#cashClosingView'), form = $('#cashClosingForm');
  if (!view || !form) return;
  const dateInput = $('#cashClosingDate'), monthInput = $('#cashClosingMonth');
  const confirmDialog = $('#cashClosingConfirm'), reportDialog = $('#cashClosingReport');
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const dateLabel = date => date.split('-').reverse().join('/');
  const dateTime = date => new Intl.DateTimeFormat('pt-BR', { timeZone: core.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(date));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const statusLabel = status => ({ confirmed: 'Confirmado', cancelled: 'Cancelado', pending: 'Pendente' }[status] || status);
  let snapshot = null, latest = null, generation = 0, historyGeneration = 0;
  let editing = false, saving = false, pendingSave = null, report = null;

  dateInput.value = dateInput.max = core.dayKey();
  monthInput.value = core.dayKey().slice(0, 7);
  const fields = () => Object.fromEntries(new FormData(form));
  function message(text, type = 'error') {
    const element = $('#cashClosingMessage');
    element.textContent = text; element.className = `closing-message ${type}`; element.hidden = !text;
  }
  function rowsTable(headers, rows) {
    return `<div class="closing-table-wrap"><table class="closing-table"><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${r.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">Nenhum registro.</td></tr>`}</tbody></table></div>`;
  }
  function movementDetails(data) {
    return `<h4>Pedidos (${data.orders.length})</h4>${rowsTable(['Pedido / cliente', 'Pagamento', 'Status', 'Valor'], data.orders.map(o => [
      `${o.code} · ${o.customerName}`, o.payment, statusLabel(o.status), money(o.trustedTotal)
    ]))}<h4>Saídas (${data.expenses.length})</h4>${rowsTable(['Observação', 'Responsável', 'Valor'], data.expenses.map(e => [e.description, e.spentBy, money(e.amount)]))}`;
  }
  function diffLabel(value) {
    const rounded = core.cents(value);
    return rounded === 0 ? 'Caixa conferido' : `${rounded > 0 ? 'Sobra' : 'Falta'} de ${money(Math.abs(value))}`;
  }
  function syncCount() {
    if (!snapshot) return;
    const values = fields();
    const complete = ['opening_cash', 'cash_expenses', 'counted_cash'].every(key => values[key] !== '' && Number.isFinite(Number(values[key])));
    const expected = (core.cents(values.opening_cash || 0) + core.cents(snapshot.summary.cashIncome) - core.cents(values.cash_expenses || 0)) / 100;
    $('#closingExpected').textContent = values.opening_cash !== '' && values.cash_expenses !== '' ? money(expected) : '—';
    const difference = (core.cents(values.counted_cash || 0) - core.cents(expected)) / 100;
    const box = $('#closingDifference');
    box.className = `closing-difference ${complete ? difference === 0 ? 'matched' : 'unmatched' : ''}`;
    box.textContent = complete ? diffLabel(difference) : 'Informe a contagem para conferir.';
    form.elements.notes.required = Boolean(latest || (complete && core.cents(difference) !== 0));
    form.elements.notes.minLength = form.elements.notes.required ? 5 : 0;
    $('#prepareCashClosing').disabled = saving || snapshot.summary.pendingCount > 0;
    $('#prepareCashClosing').textContent = latest ? 'Conferir e salvar nova versão' : 'Conferir e fechar caixa';
  }
  function renderSnapshot(resetFields) {
    const s = snapshot.summary;
    $('#cashClosingContent').hidden = false;
    $('#closingIncome').textContent = money(s.income);
    $('#closingOrderCount').textContent = `${s.confirmedCount} confirmados · ${s.cancelledCount} cancelados`;
    $('#closingExpenses').textContent = money(s.expensesTotal);
    $('#closingNet').textContent = money(s.balance);
    $('#closingPending').textContent = money(s.pendingTotal);
    $('#closingPendingCount').textContent = `${s.pendingCount} pedidos pendentes`;
    $('#closingInPerson').textContent = money(s.inPersonIncome);
    $('#closingOnline').textContent = money(s.onlineIncome);
    $('#closingPayments').innerHTML = s.payments.length ? s.payments.map(p => `<div class="closing-payment"><div><span>${escape(p.name)}</span><strong>${money(p.total)}</strong></div><div class="closing-payment-track"><i style="width:${s.income > 0 ? Math.max(0, Math.min(100, p.total / s.income * 100)) : 0}%"></i></div><small>${p.count} pedidos confirmados</small></div>`).join('') : '<p class="closing-help">Nenhuma venda confirmada neste dia.</p>';
    $('#closingMovementDetails').innerHTML = movementDetails(snapshot);
    $('#closingPendingHelp').textContent = s.pendingCount ? `${s.pendingCount} pedidos pendentes: confirme ou cancele na aba Pedidos e atualize esta conferência.` : 'Pedidos do dia resolvidos. O caixa está pronto para conferência.';
    $('#closingPendingHelp').classList.toggle('closing-attention', s.pendingCount > 0);
    form.elements.cash_expenses.max = s.expensesTotal;
    $('#closingCashExpenseHint').textContent = `Dos ${money(s.expensesTotal)} em saídas, quanto foi pago com notas e moedas? Não some novamente essas saídas.`;
    if (resetFields) {
      form.reset();
      form.elements.cash_expenses.value = s.expensesTotal === 0 ? '0' : '';
      if (latest) {
        ['opening_cash', 'cash_expenses', 'counted_cash', 'responsible'].forEach(key => { form.elements[key].value = latest[key]; });
      }
    }
    $('#closingSaved').hidden = !latest;
    $('#closingFormCard').hidden = Boolean(latest && !editing);
    $('.closing-layout').classList.toggle('closed', Boolean(latest && !editing));
    if (latest) {
      const changed = latest.snapshot.fingerprint !== snapshot.fingerprint;
      $('#closingSavedTitle').textContent = `Dia fechado · versão ${latest.revision}`;
      $('#closingSavedText').textContent = changed
        ? 'Os movimentos mudaram depois do fechamento. O comprovante anterior está preservado; registre uma correção após conferir os valores atuais.'
        : `Conferido por ${latest.responsible} em ${dateTime(latest.created_at)}. O comprovante guarda os valores daquela conferência.`;
      $('#closingSaved').classList.toggle('changed', changed);
    }
    $('#cashClosingStatus').textContent = latest ? `Fechado · v${latest.revision}` : 'Aguardando fechamento';
    syncCount();
  }
  async function load(resetFields = false) {
    const request = ++generation, date = dateInput.value;
    dateInput.max = core.dayKey();
    snapshot = null;
    $('#cashClosingContent').hidden = true;
    if (!dateInput.reportValidity() || !core.validDay(date)) {
      $('#cashClosingStatus').textContent = 'Selecione uma data válida';
      $('#refreshCashClosing').disabled = false;
      return;
    }
    $('#cashClosingStatus').textContent = 'Carregando...';
    $('#refreshCashClosing').disabled = true;
    message('');
    try {
      const data = await api.preview(date);
      if (request !== generation) return;
      snapshot = data.snapshot; latest = data.latest;
      if (resetFields) editing = false;
      renderSnapshot(resetFields);
    } catch (error) {
      if (request === generation) { message(error.message || 'Não foi possível carregar a conferência.'); $('#cashClosingStatus').textContent = 'Conferência indisponível'; }
    } finally {
      if (request === generation) $('#refreshCashClosing').disabled = false;
    }
  }
  async function loadHistory() {
    const request = ++historyGeneration;
    const container = $('#cashClosingHistory');
    container.textContent = 'Carregando fechamentos...';
    try {
      const rows = await api.history(monthInput.value);
      if (request !== historyGeneration) return;
      const newest = new Map();
      rows.forEach(r => { if (!newest.has(r.closing_date)) newest.set(r.closing_date, r.revision); });
      container.innerHTML = rows.length ? rows.map(r => `<div class="closing-history-row"><div><strong>${dateLabel(r.closing_date)}</strong><small>Versão ${r.revision} · ${newest.get(r.closing_date) === r.revision ? 'Mais recente' : 'Anterior'}</small></div><div><span>${escape(r.responsible)}</span><small>${dateTime(r.created_at)}</small></div><div><strong class="${core.cents(r.difference) === 0 ? 'closing-good' : 'closing-attention'}">${diffLabel(r.difference)}</strong><small>Contado: ${money(r.counted_cash)}</small></div><button class="secondary-button compact" type="button" data-closing-id="${escape(r.id)}">Ver comprovante</button></div>`).join('') : '<p class="closing-empty">Nenhum fechamento neste mês.</p>';
    } catch (error) {
      if (request === historyGeneration) container.textContent = error.message || 'Não foi possível carregar o histórico.';
    }
  }
  function reportMarkup(row) {
    const s = row.snapshot.summary;
    return `<div class="closing-report-heading"><h3>${dateLabel(row.closing_date)} · versão ${row.revision}</h3><p>${escape(row.responsible)} · registrado em ${dateTime(row.created_at)} · Alvarães/AM</p></div>
      ${rowsTable(['Movimentação do dia', 'Valor'], [
        ['Vendas confirmadas', money(s.income)], ['Vendas presenciais', money(s.inPersonIncome)], ['Vendas online', money(s.onlineIncome)],
        ['Saídas totais', money(s.expensesTotal)], ['Saldo das movimentações', money(s.balance)],
        ...s.payments.map(p => [`Recebido em ${p.name} (${p.count} pedidos)`, money(p.total)])
      ])}
      <h4>Conferência física do dinheiro</h4>${rowsTable(['Conferência', 'Valor'], [
        ['Dinheiro inicial', money(row.opening_cash)], ['Vendas em dinheiro', money(s.cashIncome)], ['Saídas pagas em dinheiro', money(row.cash_expenses)],
        ['Dinheiro esperado', money(row.expected_cash)], ['Dinheiro contado', money(row.counted_cash)], ['Diferença (contado − esperado)', money(row.difference)]
      ])}<p class="closing-result">${diffLabel(row.difference)}</p><p class="closing-report-notes"><strong>Observações:</strong> ${escape(row.notes || 'Sem observações.')}</p>
      <p class="closing-help">Cópia dos movimentos no momento do fechamento. Base: data de criação dos pedidos e data das saídas, no horário de Alvarães. ${s.confirmedCount} confirmados · ${s.cancelledCount} cancelados · ${s.pendingCount} pendentes. Cartões e Pix são valores brutos registrados, sem conciliação bancária ou desconto de taxas.</p>
      ${movementDetails(row.snapshot)}
      <h4>Itens vendidos nos pedidos confirmados</h4>${rowsTable(['Pedido', 'Produto', 'Quantidade', 'Subtotal'], row.snapshot.orders.filter(o => o.status === 'confirmed').flatMap(o => (o.items || []).map(i => [o.code, i.name, i.quantity, money(i.subtotal)])))}`;
  }
  function showReport(row) {
    report = row; $('#closingReportBody').innerHTML = reportMarkup(row);
    if (!reportDialog.open) reportDialog.showModal();
  }
  dateInput.addEventListener('change', () => load(true));
  $('#refreshCashClosing').addEventListener('click', () => { load(false); loadHistory(); });
  monthInput.addEventListener('change', loadHistory);
  form.addEventListener('input', syncCount);
  $('#viewLatestClosing').addEventListener('click', () => { if (latest) showReport(latest); });
  $('#reviseClosing').addEventListener('click', () => {
    editing = true; renderSnapshot(true);
    form.elements.notes.focus();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (saving || !snapshot || !form.reportValidity()) return;
    try {
      const values = core.reconcile(snapshot.summary, fields(), latest?.revision || 0);
      pendingSave = { date: snapshot.date, values, fingerprint: snapshot.fingerprint, revision: latest?.revision || 0 };
      $('#closingConfirmSummary').innerHTML = `<p><strong>${dateLabel(snapshot.date)} · ${escape(values.responsible)}</strong></p>${rowsTable(['Conferência', 'Valor'], [
        ['Vendas confirmadas', money(snapshot.summary.income)], ['Saídas totais', money(snapshot.summary.expensesTotal)],
        ['Dinheiro esperado', money(values.expected_cash)], ['Dinheiro contado', money(values.counted_cash)], ['Resultado', diffLabel(values.difference)]
      ])}<p class="closing-report-notes">${escape(values.notes)}</p>`;
      $('#closingConfirmError').hidden = true;
      confirmDialog.showModal();
    } catch (error) { message(error.message); }
  });
  $('#saveCashClosing').addEventListener('click', async () => {
    if (saving || !pendingSave) return;
    saving = true;
    const button = $('#saveCashClosing');
    button.disabled = true; button.textContent = 'Salvando...';
    confirmDialog.querySelectorAll('[data-close-closing]').forEach(b => { b.disabled = true; });
    try {
      const p = pendingSave;
      const row = await api.save(p.date, p.values, p.fingerprint, p.revision);
      confirmDialog.close(); pendingSave = null; editing = false;
      monthInput.value = row.closing_date.slice(0, 7);
      await Promise.all([load(true), loadHistory()]);
      message(`Caixa de ${dateLabel(row.closing_date)} fechado. Versão ${row.revision} salva no histórico.`, 'success');
      showReport(row);
    } catch (error) {
      const target = $('#closingConfirmError'); target.hidden = false;
      target.textContent = error.message || 'Não foi possível salvar. Atualize a conferência antes de tentar novamente.';
    } finally {
      saving = false; button.disabled = false; button.textContent = 'Confirmar fechamento';
      confirmDialog.querySelectorAll('[data-close-closing]').forEach(b => { b.disabled = false; });
      syncCount();
    }
  });
  document.querySelectorAll('[data-close-closing]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  confirmDialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  confirmDialog.addEventListener('close', () => { pendingSave = null; });
  $('#cashClosingHistory').addEventListener('click', async event => {
    const button = event.target.closest('[data-closing-id]'); if (!button) return;
    button.disabled = true;
    try { showReport(await api.get(button.dataset.closingId)); }
    catch (error) { message(error.message); }
    finally { button.disabled = false; }
  });
  $('#printCashClosing').addEventListener('click', () => {
    if (!report) return;
    const popup = window.open('', '_blank', 'width=1100,height=800');
    if (!popup) { alert('Permita a abertura de janelas para imprimir ou salvar o PDF.'); return; }
    popup.opener = null;
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Snoop — Caixa ${escape(report.closing_date)} v${report.revision}</title><style>
      @page{size:A4;margin:13mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#202020;margin:0}header{border-bottom:3px solid #e6b800;margin-bottom:18px;padding-bottom:12px}h1{font-size:23px;margin:5px 0}h3{font-size:18px}h4{margin:20px 0 8px;font-size:13px}p{line-height:1.5}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left;overflow-wrap:anywhere}th{background:#eee}tr{break-inside:avoid}thead{display:table-header-group}.closing-help{color:#555}.closing-report-notes{white-space:pre-wrap}.closing-result{font-weight:bold;font-size:17px;border:1px solid #999;padding:12px}.print-actions{margin:14px 0}button{padding:10px 16px;cursor:pointer}@media print{.print-actions{display:none}}
      </style></head><body><header><strong>DISTRIBUIDORA SNOOP</strong><h1>Fechamento de caixa</h1></header><div class="print-actions"><button id="printReport" type="button">Imprimir / Salvar como PDF</button></div>${reportMarkup(report)}</body></html>`);
    popup.document.close();
    popup.document.querySelector('#printReport').addEventListener('click', () => popup.print());
    popup.focus(); setTimeout(() => { if (!popup.closed) popup.print(); }, 300);
  });
  window.addEventListener('snoop:data-reset', () => { if (!view.hidden) { load(true); loadHistory(); } });
  window.AdminCashClosing = { open: () => { load(true); loadHistory(); } };
})();
