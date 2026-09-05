(function () {
  'use strict';

  const view = document.querySelector('#controlView');
  const resetDialog = document.querySelector('#resetDataDialog');
  const resetForm = document.querySelector('#resetDataForm');
  const resetButton = document.querySelector('#confirmResetData');
  const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const dateTime = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '';
  const dateOnly = (value) => {
    if (!value) return '';
    const dateParts = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return dateParts
      ? `${dateParts[3]}/${dateParts[2]}/${dateParts[1]}`
      : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
  };
  const statusName = (status) => ({ pending: 'Pendente', confirmed: 'Confirmado', cancelled: 'Cancelado' }[status] || status || '');
  let snapshot = { products: [], orders: [], expenses: [] };

  if (!view || !resetDialog || !resetForm) return;

  function notify(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function summary(data) {
    const confirmed = data.orders.filter((order) => order.status === 'confirmed');
    const income = confirmed.reduce((total, order) => total + (Number(order.trustedTotal) || 0), 0);
    const outcome = data.expenses.reduce((total, expense) => total + (Number(expense.amount) || 0), 0);
    return { confirmed: confirmed.length, income, outcome, balance: income - outcome };
  }

  function updateView(data) {
    snapshot = {
      products: Array.isArray(data.products) ? data.products : [],
      orders: Array.isArray(data.orders) ? data.orders : [],
      expenses: Array.isArray(data.expenses) ? data.expenses : []
    };
    const totals = summary(snapshot);
    document.querySelector('#controlOrders').textContent = snapshot.orders.length;
    document.querySelector('#controlIncome').textContent = money(totals.income);
    document.querySelector('#controlExpenses').textContent = money(totals.outcome);
    document.querySelector('#controlBalance').textContent = money(totals.balance);
    document.querySelector('#controlProducts').textContent = snapshot.products.length;
    document.querySelector('#resetScopeOrders').textContent = `${snapshot.orders.length} ${snapshot.orders.length === 1 ? 'registro' : 'registros'}`;
    document.querySelector('#resetScopeExpenses').textContent = `${snapshot.expenses.length} ${snapshot.expenses.length === 1 ? 'registro' : 'registros'}`;
  }

  async function getFreshSnapshot() {
    const [products, orders, expenses] = await Promise.all([
      StoreAPI.getProducts(true),
      StoreAPI.getOrders(),
      StoreAPI.getExpenses()
    ]);
    const data = { products, orders, expenses };
    updateView(data);
    return data;
  }

  async function render(data) {
    try {
      if (data) updateView(data);
      else await getFreshSnapshot();
    } catch (error) {
      notify(error.message || 'Não foi possível carregar o controle geral.');
    }
  }

  function escapeCsv(value) {
    let safeValue = String(value ?? '');
    if (/^\s*[=+@]/.test(safeValue) || /^\s*-(?![\d.,])/.test(safeValue)) safeValue = `'${safeValue}`;
    return `"${safeValue.replace(/"/g, '""')}"`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[character]));
  }

  function download(content, type, filename) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportSpreadsheet(data) {
    const totals = summary(data);
    const rows = [
      ['RELATÓRIO GERAL — DISTRIBUIDORA SNOOP'],
      ['Gerado em', dateTime(new Date())],
      ['Pedidos registrados', data.orders.length],
      ['Pedidos confirmados', totals.confirmed],
      ['Entradas confirmadas', totals.income.toFixed(2)],
      ['Saídas registradas', totals.outcome.toFixed(2)],
      ['Saldo atual', totals.balance.toFixed(2)],
      ['Produtos cadastrados', data.products.length],
      [],
      ['Tipo', 'Código ou ID', 'Data', 'Status', 'Cliente ou responsável', 'Canal ou categoria', 'Pagamento', 'Descrição ou observação', 'Itens', 'Quantidade', 'Valor unitário', 'Valor total', 'Disponibilidade']
    ];

    data.orders.forEach((order) => rows.push([
      'Pedido', order.code || order.id, dateTime(order.createdAt), statusName(order.status), order.customerName,
      order.address === 'Venda presencial' ? 'Presencial' : 'Online', order.payment, order.notes,
      (order.items || []).map((item) => `${item.quantity}x ${item.name}`).join(' | '),
      (order.items || []).reduce((total, item) => total + (Number(item.quantity) || 0), 0), '', (Number(order.trustedTotal) || 0).toFixed(2), ''
    ]));

    data.expenses.forEach((expense) => rows.push([
      'Saída', expense.id, dateOnly(expense.spentAt || expense.createdAt), '', expense.spentBy, '', '', expense.description,
      '', '', '', (Number(expense.amount) || 0).toFixed(2), ''
    ]));

    data.products.forEach((product) => rows.push([
      'Produto', product.id, '', '', product.name, product.category, '', product.description,
      '', '', (Number(product.price) || 0).toFixed(2), '', product.available ? 'Em estoque' : 'Em falta'
    ]));

    const csv = `\ufeff${rows.map((row) => row.map(escapeCsv).join(';')).join('\r\n')}`;
    download(csv, 'text/csv;charset=utf-8', `snoop-controle-geral-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function tableRows(rows, columns, emptyText) {
    if (!rows.length) return `<tr><td colspan="${columns.length}" class="empty">${emptyText}</td></tr>`;
    return rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join('')}</tr>`).join('');
  }

  function exportPdf(data, reportWindow) {
    const totals = summary(data);

    const orderColumns = [
      { label: 'Data', value: (order) => dateTime(order.createdAt) },
      { label: 'Código', value: (order) => order.code },
      { label: 'Cliente', value: (order) => order.customerName },
      { label: 'Status', value: (order) => statusName(order.status) },
      { label: 'Canal', value: (order) => order.address === 'Venda presencial' ? 'Presencial' : 'Online' },
      { label: 'Pagamento', value: (order) => order.payment },
      { label: 'Itens', value: (order) => (order.items || []).map((item) => `${item.quantity}x ${item.name}`).join(' | ') },
      { label: 'Total', value: (order) => money(order.trustedTotal) }
    ];
    const expenseColumns = [
      { label: 'Data', value: (expense) => dateOnly(expense.spentAt || expense.createdAt) },
      { label: 'Observação', value: (expense) => expense.description },
      { label: 'Responsável', value: (expense) => expense.spentBy },
      { label: 'Valor', value: (expense) => money(expense.amount) }
    ];
    const productColumns = [
      { label: 'Produto', value: (product) => product.name },
      { label: 'Categoria', value: (product) => product.category },
      { label: 'Preço', value: (product) => money(product.price) },
      { label: 'Estoque', value: (product) => product.available ? 'Disponível' : 'Em falta' }
    ];
    const headers = (columns) => columns.map((column) => `<th>${column.label}</th>`).join('');

    reportWindow.document.open();
    reportWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório geral — Distribuidora Snoop</title><style>
      @page{size:A4 landscape;margin:11mm}*{box-sizing:border-box}body{margin:0;color:#171717;font-family:Arial,sans-serif;font-size:9px}header{display:flex;align-items:end;justify-content:space-between;padding-bottom:12px;border-bottom:3px solid #e1ad00}h1{margin:0;font-size:23px;text-transform:uppercase}header p{margin:4px 0 0;color:#666}header strong{color:#b78c00}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.summary div{padding:10px;border:1px solid #ddd;border-radius:7px}.summary span{display:block;color:#666;font-size:8px;text-transform:uppercase}.summary b{display:block;margin-top:4px;font-size:14px}.summary .income b{color:#16804a}.summary .outcome b{color:#b82f35}.summary .balance b{color:#9a7500}section{margin-top:16px;break-inside:auto}h2{margin:0 0 7px;font-size:13px;text-transform:uppercase}table{width:100%;border-collapse:collapse;table-layout:fixed}th{padding:6px;background:#171717;color:#fff;text-align:left}td{padding:5px;border:1px solid #ddd;vertical-align:top;overflow-wrap:anywhere}tr:nth-child(even) td{background:#f6f6f6}.empty{text-align:center;color:#777;padding:12px}footer{margin-top:15px;padding-top:8px;border-top:1px solid #ddd;color:#777;text-align:center}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><header><div><strong>DISTRIBUIDORA SNOOP</strong><h1>Relatório geral</h1><p>Pedidos, movimentação financeira e catálogo</p></div><div>Gerado em ${escapeHtml(dateTime(new Date()))}</div></header>
    <div class="summary"><div><span>Pedidos</span><b>${data.orders.length}</b></div><div class="income"><span>Entradas confirmadas</span><b>${money(totals.income)}</b></div><div class="outcome"><span>Saídas</span><b>${money(totals.outcome)}</b></div><div class="balance"><span>Saldo atual</span><b>${money(totals.balance)}</b></div></div>
    <section><h2>Pedidos registrados</h2><table><thead><tr>${headers(orderColumns)}</tr></thead><tbody>${tableRows(data.orders, orderColumns, 'Nenhum pedido registrado.')}</tbody></table></section>
    <section><h2>Saídas financeiras</h2><table><thead><tr>${headers(expenseColumns)}</tr></thead><tbody>${tableRows(data.expenses, expenseColumns, 'Nenhuma saída registrada.')}</tbody></table></section>
    <section><h2>Produtos cadastrados</h2><table><thead><tr>${headers(productColumns)}</tr></thead><tbody>${tableRows(data.products, productColumns, 'Nenhum produto cadastrado.')}</tbody></table></section>
    <footer>Documento gerado pelo painel administrativo da Distribuidora Snoop.</footer></body></html>`);
    reportWindow.document.close();
    reportWindow.opener = null;
    reportWindow.focus();
    window.setTimeout(() => reportWindow.print(), 350);
  }

  async function runExport(button, exporter, reportWindow) {
    button.disabled = true;
    button.classList.add('loading');
    try {
      const data = await getFreshSnapshot();
      exporter(data);
      document.querySelector('#controlBackupStatus').textContent = `Última exportação: ${dateTime(new Date())}`;
      notify('Relatório preparado com sucesso.');
    } catch (error) {
      if (reportWindow && !reportWindow.closed) reportWindow.close();
      notify(error.message || 'Não foi possível exportar os registros.');
    } finally {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }

  document.querySelector('#exportControlPdf').addEventListener('click', (event) => {
    const reportWindow = window.open('', '_blank', 'width=1200,height=850');
    if (!reportWindow) {
      notify('Permita a abertura de janelas para exportar o PDF.');
      return;
    }
    reportWindow.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Preparando relatório...</title><style>body{display:grid;min-height:100vh;margin:0;place-items:center;background:#111;color:#fff;font:600 16px Arial,sans-serif}</style></head><body>Preparando relatório...</body></html>');
    reportWindow.document.close();
    runExport(event.currentTarget, (data) => exportPdf(data, reportWindow), reportWindow);
  });
  document.querySelector('#exportControlSheet').addEventListener('click', (event) => runExport(event.currentTarget, exportSpreadsheet));

  function syncResetButton() {
    const password = resetForm.elements.password.value;
    const confirmation = resetForm.elements.confirmation.value.trim().toUpperCase();
    resetButton.disabled = !password || confirmation !== 'ZERAR';
  }

  document.querySelector('#openResetData').addEventListener('click', async () => {
    try {
      const data = await getFreshSnapshot();
      if (!data.orders.length && !data.expenses.length) {
        notify('O histórico operacional já está vazio.');
        return;
      }
      resetForm.reset();
      syncResetButton();
      resetDialog.showModal();
      window.setTimeout(() => resetForm.elements.password.focus(), 50);
    } catch (error) {
      notify(error.message || 'Não foi possível preparar o reset.');
    }
  });

  resetForm.addEventListener('input', syncResetButton);
  resetDialog.addEventListener('close', () => {
    resetForm.reset();
    resetButton.disabled = true;
    resetButton.classList.remove('loading');
  });

  resetButton.addEventListener('click', async () => {
    if (!resetForm.reportValidity() || resetForm.elements.confirmation.value.trim().toUpperCase() !== 'ZERAR') return;
    const password = resetForm.elements.password.value;
    resetButton.disabled = true;
    resetButton.classList.add('loading');
    resetButton.textContent = 'Validando e apagando...';

    try {
      const verified = await StoreAPI.verifyAdminPassword(password);
      if (!verified) throw new Error('Senha incorreta. O histórico não foi alterado.');
      const result = await StoreAPI.resetOperationalData();
      resetDialog.close();
      updateView({ products: snapshot.products, orders: [], expenses: [] });
      window.dispatchEvent(new CustomEvent('snoop:data-reset'));
      notify(`Reset concluído: ${Number(result?.orders) || 0} pedidos e ${Number(result?.expenses) || 0} saídas apagados.`);
    } catch (error) {
      notify(error.message || 'Não foi possível resetar o histórico.');
      resetButton.disabled = false;
      resetButton.classList.remove('loading');
    } finally {
      resetButton.textContent = 'Apagar histórico';
      if (resetDialog.open) syncResetButton();
    }
  });

  window.AdminControl = { render };
})();
