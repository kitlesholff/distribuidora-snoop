(function () {
  'use strict';
  const $ = s => document.querySelector(s), view = $('#cashClosingView');
  const api = window.CashRegisterStore, core = window.CashRegisterCore;
  const money = n => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n || 0);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = s => new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Manaus',dateStyle:'short',timeStyle:'short'}).format(new Date(s));
  const kinds = {receipt:'Recebimento',expense:'Despesa',reinforcement:'Reforço',withdrawal:'Sangria',refund:'Devolução'};
  const methods = {cash:'Dinheiro',pix:'Pix',card:'Cartão'};
  const input = (name, zero = true) => `<input name="${name}" type="number" min="${zero ? '0' : '0.01'}" max="99999999.99" step="0.01" required placeholder="0,00">`;
  view.innerHTML = `
    <div class="closing-toolbar"><div><span class="eyebrow">Distribuidora Snoop</span><h2>Fechamento de caixa</h2><p>Confira o dinheiro. O sistema organiza o restante.</p></div><span class="closing-timezone" id="registerDate">Alvarães · Amazonas</span></div>
    <p id="registerMessage" class="closing-message" role="status" hidden></p><p id="registerLoading" class="closing-help">Carregando caixa…</p>
    <article id="registerOpening" class="closing-card" hidden><span class="card-kicker">Comece o expediente</span><h3>Abertura de caixa</h3><p class="closing-help">Conte o valor realmente deixado para troco. O saldo anterior não é transferido automaticamente.</p><form id="registerOpenForm"><label>Fundo de abertura (R$)${input('opening_cash')}</label><p class="closing-help register-actor"></p><button class="primary-button" type="submit">Abrir caixa</button></form></article>
    <div id="registerContent" hidden><div id="registerSaved" class="closing-saved" hidden></div>
      <section class="closing-card register-sales" aria-labelledby="registerSalesTitle"><div class="register-sales-heading"><div><span class="card-kicker">Vendas confirmadas e recebidas</span><h3 id="registerSalesTitle">Total de vendas do dia</h3></div><strong id="registerSalesTotal">—</strong></div><div class="register-sales-methods" id="registerSalesMethods"></div><p class="closing-help" id="registerSalesHelp">Vendas do caixa aberto, antes das saídas. O fundo de abertura e os reforços não são vendas.</p></section>
      <div class="register-layout"><div class="register-left">
        <article class="closing-card"><div class="register-heading"><span aria-hidden="true">⇄</span><div><h3>Movimentações automáticas</h3><p>Lançamentos do caixa já considerados pelo sistema.</p></div></div><div id="registerTotals"></div><details class="closing-details"><summary>Ver lançamentos</summary><div id="registerMovements"></div></details></article>
        <article class="closing-card"><div class="register-heading"><span aria-hidden="true">▣</span><div><h3>Outros pagamentos</h3><p>Recebimentos contabilizados ao confirmar os pedidos.</p></div></div><div id="registerPayments"></div><p class="closing-help">Cartão: valor bruto aprovado na venda. O depósito da operadora e as taxas não fazem parte da gaveta.</p></article>
      </div><article class="closing-card" id="registerCountCard"><div class="register-heading"><span aria-hidden="true">▤</span><div><h3>Sua conferência</h3><p>Informe o valor contado na gaveta.</p></div></div>
        <form id="registerCloseForm"><label>Dinheiro contado na gaveta (R$)${input('counted_cash')}<small class="closing-help">Conte todas as notas e moedas, incluindo o troco que restou da abertura. Pix e cartão são conferidos separadamente.</small></label><details class="register-denominations"><summary>Contar por notas e moedas</summary><div id="registerDenominations"></div><button type="button" id="useDenominations" class="secondary-button">Usar total da contagem</button></details>
          <div class="register-diff-section"><h3>△ &nbsp; Diferença</h3><div id="registerDifference" class="closing-difference" aria-live="polite">Aguardando contagem</div></div><div class="register-identity"><p class="register-actor"></p><p>◷ &nbsp; Horário registrado ao fechar <span>Automático</span></p></div>
          <label id="registerNotesLabel" hidden>Justificativa<textarea name="notes" rows="3" maxlength="1000" aria-describedby="registerNotesReason" placeholder="Explique o que ocorreu após conferir os lançamentos."></textarea><small id="registerNotesReason" class="closing-help"></small></label><label class="register-check" id="registerKeepLabel" hidden><input name="keep_pending" type="checkbox"> Manter os pedidos listados aguardando confirmação</label><p class="closing-help">Se o dinheiro conferir e não houver pendências ou correção, não é preciso justificar.</p><button type="submit" class="primary-button">Conferir e fechar caixa</button>
        </form></article></div>
      <details class="closing-card register-pending" id="registerPendingPanel"><summary id="registerPendingTitle">Pendências do caixa</summary><div id="registerPending"></div></details>
      <article class="closing-card register-entry" id="registerEntryCard"><div class="register-heading"><span aria-hidden="true">＋</span><div><h3>Registrar movimentação</h3><p>Pedidos confirmados entram automaticamente. Registre aqui despesas, retiradas e devoluções.</p></div></div><form id="registerMovementForm"><div class="register-entry-grid">
        <label>Tipo<select name="kind">${Object.entries(kinds).filter(([k])=>k!=='receipt').map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Forma de pagamento<select name="method">${Object.entries(methods).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Valor (R$)${input('amount',false)}</label><label id="registerOrderLabel">Pedido confirmado<select name="order_id"></select></label><label id="registerReceiptLabel" hidden>Recebimento original<select name="receipt_id"></select></label><label class="register-description">Descrição / motivo<input name="description" minlength="5" maxlength="300" required placeholder="Identifique o recebimento ou explique a saída"></label>
        </div><label id="registerRefundIdLabel" hidden>ID de recebimento de outro caixa (opcional)<input name="external_receipt_id" placeholder="Identificador no comprovante original"></label><button class="primary-button" type="submit">Registrar movimentação</button><p class="closing-help">Data e responsável são automáticos. Cada despesa entra uma única vez; sangria não é despesa.</p></form></article>
    </div><details class="closing-card closing-history" open><summary>Histórico de fechamentos</summary><div class="closing-history-head"><p>Comprovantes preservados, com horário, responsável e versões.</p><label>Mês<input type="month" id="registerMonth"></label></div><div id="registerHistory"></div><details class="closing-details"><summary>Fechamentos anteriores à nova rotina</summary><div id="registerLegacy"></div></details></details>`;
  let state, actor = '', busy = false, revisionMode = false, generation = 0, historyRows = [], confirmPayload, selectedSession = null;
  const openForm = $('#registerOpenForm'), closeForm = $('#registerCloseForm'), movementForm = $('#registerMovementForm');
  const message = (text, error = false) => { const el=$('#registerMessage'); el.hidden=!text; el.textContent=text; el.className=`closing-message ${error?'error':'success'}`; };
  const values = form => Object.fromEntries(new FormData(form));
  function table(headers, rows) { return `<div class="closing-table-wrap"><table class="closing-table"><thead><tr>${headers.map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${headers.length}">Nenhum registro.</td></tr>`}</tbody></table></div>`; }
  function movementsTable(rows) { return table(['Lançamento / ID','Forma','Valor','Horário'],rows.map(m=>[`${kinds[m.kind]} · ${m.description} · ${m.id}`,methods[m.method],money(m.amount),time(m.created_at)])); }
  function syncCount() {
    if (!state?.session) return;
    const summary=core.summarize(state.session,state.movements,state.pending), raw=closeForm.elements.counted_cash.value;
    const diff=(core.cents(raw || 0)-core.cents(summary.expected))/100;
    const el=$('#registerDifference');
    el.textContent=raw===''?'Aguardando contagem':diff===0?'Confere · dinheiro contado e esperado iguais':`${diff>0?'Sobra':'Falta'} de ${money(Math.abs(diff))}`;
    el.className=`closing-difference ${raw===''?'':diff===0?'matched':'unmatched'}`;
    const required=(raw!=='' && diff!==0)||state.pending.length>0||revisionMode;
    $('#registerNotesLabel').hidden=!required; closeForm.elements.notes.required=Boolean(required); closeForm.elements.notes.minLength=required?5:0;
    const reasons=[];
    if(raw!=='' && diff!==0) reasons.push(`O esperado na gaveta é ${money(summary.expected)} e você contou ${money(Number(raw))}. Explique a ${diff>0?'sobra':'falta'} de ${money(Math.abs(diff))} para registrá-la no histórico. Confira a contagem e os lançamentos antes de concluir.`);
    if(state.pending.length) reasons.push(`${state.pending.length} pedido(s) ainda aguardam confirmação. Explique por que ficarão pendentes.`);
    if(revisionMode) reasons.push('Esta é uma correção de um fechamento salvo. Informe o motivo da nova contagem.');
    $('#registerNotesReason').textContent=reasons.join(' ');
    $('#registerKeepLabel').hidden=!state.pending.length;
    closeForm.querySelector('button[type=submit]').disabled=busy||summary.unverified.length>0;
  }
  function movementKind() {
    const kind=movementForm.elements.kind.value;
    $('#registerOrderLabel').hidden=kind!=='receipt'; $('#registerReceiptLabel').hidden=kind!=='refund'; $('#registerRefundIdLabel').hidden=kind!=='refund';
    movementForm.elements.order_id.required=kind==='receipt';
    movementForm.elements.method.disabled=['reinforcement','withdrawal'].includes(kind);
    if (movementForm.elements.method.disabled) movementForm.elements.method.value='cash';
  }
  function render() {
    const s=state.session, closed=Boolean(s?.closed_at);
    $('#registerOpening').hidden=Boolean(s); $('#registerContent').hidden=!s;
    document.querySelectorAll('.register-actor').forEach(el=>el.textContent=`Responsável · ${actor}`);
    $('#registerDate').textContent=`${(s?.business_date || window.CashClosingCore.dayKey()).split('-').reverse().join('/')} · Alvarães`;
    if (!s) return;
    const summary=core.summarize(s,state.movements,state.pending);
    $('#registerSalesTotal').textContent=money(summary.salesTotal);
    $('#registerSalesMethods').innerHTML=[['Dinheiro',summary.cashIncome,'Notas e moedas recebidas nas vendas'],['Pix',summary.pix,'Recebido na conta'],['Cartão',summary.card,'Vendas aprovadas na máquina']].map(([label,total,help])=>`<div><span>${label}</span><strong>${money(total)}</strong><small>${help}</small></div>`).join('');
    $('#registerSalesHelp').textContent=`Vendas do caixa de ${s.business_date.split('-').reverse().join('/')}, antes das saídas e devoluções. Fundo de abertura e reforços não são vendas. Para conferir as notas e moedas, compare sua contagem com o dinheiro esperado na gaveta abaixo.`;
    $('#registerTotals').innerHTML=[['◉','Fundo de abertura',s.opening_cash],['▱','Recebimentos em dinheiro',summary.cashIncome],['⊕','Reforços de caixa',summary.reinforcement],['↗','Saídas em dinheiro',summary.cashExpenses],['↶','Sangrias e devoluções',summary.withdrawal+summary.refund]].map(([icon,title,n])=>`<div class="register-total"><span class="register-icon" aria-hidden="true">${icon}</span><span>${title}</span><small>Automático</small><strong>${money(n)}</strong></div>`).join('')+`<div class="register-total register-expected"><span aria-hidden="true">▣</span><b>Dinheiro esperado</b><strong>${money(summary.expected)}</strong></div>`;
    $('#registerMovements').innerHTML=movementsTable(state.movements);
    $('#registerPayments').innerHTML=['pix','card'].map(method=>`<details class="register-payment"><summary>${methods[method]} <strong>${money(summary[method])}</strong><span>Ver recebimentos</span></summary><div>${state.movements.filter(m=>m.kind==='receipt'&&m.method===method).map(m=>`<div class="register-verification"><span>${esc(m.description)} · ${money(m.amount)}<small>${esc(m.id)}</small></span>${m.verified_at?`<small>Conferido em ${time(m.verified_at)}</small>`:`<button type="button" class="secondary-button" data-verify="${esc(m.id)}" ${closed?'disabled':''}>${method==='pix'?'Confirmei no banco':'Venda aprovada'}</button>`}</div>`).join('')||'<p class="closing-help">Nenhum recebimento registrado.</p>'}</div></details>`).join('');
    $('#registerPendingTitle').textContent=state.pending.length?`⚠ ${state.pending.length} pedidos aguardando confirmação · ${money(state.pending.reduce((n,o)=>n+Number(o.remaining),0))}`:'✓ Nenhum pedido aguardando confirmação';
    $('#registerPending').innerHTML='<p class="closing-help">Confirmar significa que o pagamento foi recebido. Confirmados já foram contabilizados; cancelados representam compras adiadas e não entram nos recebimentos.</p>'+table(['Pedido','Cliente','Situação','Valor do pedido'],state.pending.map(o=>[o.code,o.customer,o.status==='confirmed'?'Recebido':'Pedido não confirmado',money(o.remaining)]));
    const selected=movementForm.elements.order_id.value;
    movementForm.elements.order_id.innerHTML='<option value="">Selecione o pedido</option>'+state.pending.filter(o=>o.status==='confirmed').map(o=>`<option value="${esc(o.id)}">${esc(o.code)} · ${esc(o.customer)} · ${money(o.remaining)}</option>`).join('');
    movementForm.elements.order_id.value=selected;
    movementForm.elements.receipt_id.innerHTML='<option value="">Selecione o recebimento</option>'+state.movements.filter(m=>m.kind==='receipt').map(m=>`<option value="${esc(m.id)}">${esc(m.description)} · ${methods[m.method]} · ${money(m.amount)}</option>`).join('');
    $('#registerCountCard').hidden=closed&&!revisionMode; $('#registerEntryCard').hidden=closed;
    $('#registerSaved').hidden=!closed;
    if(closed) $('#registerSaved').innerHTML=`<div><strong>Caixa fechado · versão ${state.latest.revision}</strong><p>${esc(state.latest.responsible)} · ${time(state.latest.created_at)}. Lançamentos protegidos.</p></div><div class="closing-buttons"><button type="button" class="secondary-button" id="registerViewLatest">Ver comprovante</button><button type="button" class="secondary-button" id="registerRevise">Corrigir contagem</button></div>`;
    closeForm.querySelector('button[type=submit]').textContent=revisionMode?'Conferir e salvar correção':'Conferir e fechar caixa';
    movementKind(); syncCount();
  }
  async function load() {
    const request=++generation;
    try {
      const [data,name]=await Promise.all([api.rpc('preview',selectedSession?{session_id:selectedSession}:{}),api.user()]);
      if(request!==generation)return;
      const changed=!state || state.fingerprint!==data.fingerprint || actor!==name;
      state=data; actor=name; if(changed)render(); $('#registerLoading').hidden=true;
    } catch(e) { if(request===generation){message(e.message,true);$('#registerLoading').textContent='Não foi possível atualizar o caixa.'; state=null; $('#registerContent').hidden=true; $('#registerOpening').hidden=true;} }
  }
  async function history() {
    const month=$('#registerMonth').value;
    try {
      const rows=await api.rpc('history',{month}); if(month!==$('#registerMonth').value)return; historyRows=rows;
      $('#registerHistory').innerHTML=rows.map(r=>`<div class="closing-history-row"><div><strong>${r.business_date.split('-').reverse().join('/')}</strong><small>Versão ${r.revision}</small></div><div>${esc(r.responsible)}<small>${time(r.created_at)}</small></div><strong>${r.difference===0?'Confere':money(r.difference)}</strong><div class="closing-buttons"><button class="secondary-button" data-report="${esc(r.id)}">Ver comprovante</button>${rows.some(other=>other.session_id===r.session_id&&other.revision>r.revision)?'':`<button class="secondary-button" data-revise-session="${esc(r.session_id)}">Corrigir contagem</button>`}</div></div>`).join('')||'<p class="closing-help">Nenhum fechamento neste mês.</p>';
      const legacy=await window.CashClosingStore.history(month); if(month!==$('#registerMonth').value)return;
      $('#registerLegacy').innerHTML=legacy.map(r=>`<div class="closing-history-row"><span>${esc(r.closing_date)} · v${r.revision}</span><span>${esc(r.responsible)}</span><span>${money(r.counted_cash)}</span><button class="secondary-button" data-legacy="${esc(r.id)}">Ver comprovante</button></div>`).join('')||'<p class="closing-help">Nenhum registro anterior neste mês.</p>';
    } catch(e){$('#registerHistory').textContent=e.message;}
  }
  async function mutate(action,payload,form) {
    if(busy)return; busy=true; ++generation;
    const buttons=view.querySelectorAll('button'); buttons.forEach(b=>b.disabled=true);
    try {state=await api.rpc(action,payload); form?.reset(); revisionMode=false; message(action==='open'?'Caixa aberto. Registre os recebimentos e as saídas durante o expediente.':'Lançamento salvo. Conferência atualizada.'); render(); await history();return true;}
    catch(e){message(e.message,true);await load();return false;}
    finally {busy=false;buttons.forEach(b=>b.disabled=false);syncCount();}
  }
  openForm.addEventListener('submit',e=>{e.preventDefault();if(openForm.reportValidity())mutate('open',values(openForm),openForm);});
  movementForm.addEventListener('change',movementKind);
  let movementRequest=null;
  movementForm.addEventListener('input',()=>{movementRequest=null;});
  movementForm.addEventListener('submit',e=>{e.preventDefault();if(!state||!movementForm.reportValidity())return;const p=values(movementForm);p.method=movementForm.elements.method.value;p.receipt_id=p.external_receipt_id.trim()||p.receipt_id;movementRequest ||= crypto.randomUUID(); mutate('movement',{...p,id:movementRequest,session_id:state.session.id},movementForm).then(saved=>{if(saved)movementRequest=null;});});
  closeForm.addEventListener('input',syncCount);
  const dialog=$('#cashClosingConfirm');
  closeForm.addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!state||!closeForm.reportValidity())return;
    try {
      // Recalcula ao iniciar a confirmação; a gravação volta a conferir no servidor.
      const fresh=await api.rpc('preview',{session_id:state.session.id});state=fresh;render();
      const fields=core.closing(core.summarize(state.session,state.movements,state.pending),values(closeForm),state.latest?.revision||0);
      confirmPayload={...fields,session_id:state.session.id,revision:state.latest?.revision||0,fingerprint:state.fingerprint};
      $('#closingConfirmSummary').innerHTML=table(['Conferência','Valor'],[['Dinheiro esperado',money(core.summarize(state.session,state.movements).expected)],['Dinheiro contado',money(fields.counted_cash)],['Diferença',money(fields.difference)],['Pagamentos mantidos pendentes',state.pending.length]])+`<p>${esc(fields.notes)}</p>`;
      $('#closingConfirmError').hidden=true;dialog.showModal();
    } catch(err){message(err.message,true);}
  });
  $('#saveCashClosing').addEventListener('click',async()=>{
    if(busy||!confirmPayload)return; busy=true;++generation;$('#saveCashClosing').disabled=true;
    try{state=await api.rpc('close',confirmPayload);revisionMode=false;closeForm.reset();dialog.close();render();await history();message('Fechamento salvo com horário, responsável e comprovante.');}
    catch(e){$('#closingConfirmError').hidden=false;$('#closingConfirmError').textContent=e.message;}
    finally{busy=false;$('#saveCashClosing').disabled=false;syncCount();}
  });
  document.querySelectorAll('[data-close-closing]').forEach(b=>b.addEventListener('click',()=>{if(!busy)b.closest('dialog').close();}));
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.querySelector('.closing-help').textContent='O fechamento preserva os lançamentos e a conferência. Correções da contagem geram uma nova versão com justificativa.';
  function report(row,legacy=false) {
    const body=$('#closingReportBody');
    body.innerHTML=`<h3>${esc(row.business_date||row.closing_date)} · versão ${row.revision}</h3><p>${esc(row.responsible)} · ${time(row.created_at)}</p>`+table(['Conferência','Valor'],[['Esperado',money(row.expected_cash)],['Contado',money(row.counted_cash)],['Diferença',money(row.difference)]])+`<p class="closing-report-notes">${esc(row.notes||'Sem observações.')}</p>`;
    if(legacy) body.innerHTML+=`<p class="closing-help">Comprovante da rotina anterior, calculado com pedidos confirmados por data de criação.</p>`+table(['Conferência anterior','Valor'],[['Fundo inicial',money(row.opening_cash)],['Saídas em dinheiro',money(row.cash_expenses)],['Vendas confirmadas',money(row.snapshot.summary.income)]])+table(['Pedido','Cliente','Pagamento','Status','Valor'],row.snapshot.orders.map(o=>[o.code,o.customerName,o.payment,o.status,money(o.trustedTotal)]))+table(['Saída','Responsável','Valor'],row.snapshot.expenses.map(e=>[e.description,e.spentBy,money(e.amount)]));
    else body.innerHTML+=table(['Abertura','Valor'],[['Fundo',money(row.snapshot.session.opening_cash)],['Horário',time(row.snapshot.session.opened_at)],['Responsável',row.snapshot.session.opened_by]])+movementsTable(row.snapshot.movements)+table(['Pendência preservada','Saldo'],row.snapshot.pending.map(o=>[o.code,money(o.remaining)]));
    $('#cashClosingReport').showModal();
  }
  view.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.verify&&state)mutate('verify',{id:b.dataset.verify,session_id:state.session.id});
    if(b.id==='registerRevise'){revisionMode=true;closeForm.elements.counted_cash.value=state.latest.counted_cash;render();closeForm.elements.notes.focus();}
    if(b.id==='registerViewLatest')report(state.latest);
    if(b.dataset.report)report(historyRows.find(r=>r.id===b.dataset.report));
    if(b.dataset.reviseSession){selectedSession=b.dataset.reviseSession;await load();if(state?.session?.id===selectedSession){revisionMode=true;closeForm.elements.counted_cash.value=state.latest.counted_cash;render();closeForm.elements.notes.focus();message('Correção do caixa selecionado no histórico. Para voltar ao caixa atual, clique novamente em Fechamento de caixa no menu.');}}
    if(b.dataset.legacy)try{report(await window.CashClosingStore.get(b.dataset.legacy),true);}catch(err){message(err.message,true);}
  });
  $('#printCashClosing').addEventListener('click',()=>{
    const popup=window.open('','_blank','width=1000,height=800');if(!popup){message('Permita a janela de impressão no navegador.',true);return;}
    popup.opener=null;popup.document.write('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Comprovante de caixa · Snoop</title><style>body{font:13px Arial;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{padding:8px;border-bottom:1px solid #ccc;text-align:left;overflow-wrap:anywhere}tr{break-inside:avoid}p{white-space:pre-wrap}thead{display:table-header-group}</style><h1>Distribuidora Snoop · Caixa</h1>'+$('#closingReportBody').innerHTML+'</html>');popup.document.close();popup.focus();popup.print();
  });
  $('#registerDenominations').innerHTML=[200,100,50,20,10,5,2,1,.5,.25,.1,.05,.01].map(n=>`<label>${money(n)}<input type="number" min="0" max="100000" step="1" value="0" data-denomination="${n}" aria-label="Quantidade de ${money(n)}"></label>`).join('');
  $('#useDenominations').addEventListener('click',()=>{const inputs=[...document.querySelectorAll('[data-denomination]')];if(inputs.some(i=>!i.reportValidity()))return;closeForm.elements.counted_cash.value=(inputs.reduce((n,i)=>n+core.cents(i.dataset.denomination)*Number(i.value),0)/100).toFixed(2);syncCount();});
  $('#registerMonth').value=window.CashClosingCore.dayKey().slice(0,7);$('#registerMonth').addEventListener('change',history);
  window.AdminCashClosing={open:()=>{selectedSession=null;revisionMode=false;state=null;load();history();}};
  window.addEventListener('storage',()=>{if(!view.hidden&&!busy&&!dialog.open)load();});
  window.addEventListener('focus',()=>{if(!view.hidden&&!busy&&!dialog.open)load();});
  window.setInterval(()=>{if(!view.hidden&&!document.hidden&&!busy&&!dialog.open)load();},15000);
})();
