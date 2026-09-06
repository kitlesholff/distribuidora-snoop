(function () {
  'use strict';
  const store = window.StoreAPI, core = window.CashRegisterCore, key = 'snoop_register_v2';
  const read = () => JSON.parse(localStorage.getItem(key) || '{"sessions":[],"movements":[],"closings":[]}');
  const orders = (db = read()) => JSON.parse(localStorage.getItem('snoop_orders_v1') || '[]').map(o => db.orderStates?.[o.id] || o);
  const paymentMethod = payment => {
    const text = String(payment || '').trim().toLowerCase();
    if (text === 'dinheiro' || text === 'cash') return 'cash';
    if (text === 'pix') return 'pix';
    if (/^(cartão|cartao|card)/.test(text)) return 'card';
    throw Error('Informe dinheiro, Pix ou cartão antes de confirmar.');
  };
  function syncConfirmed(db, responsible) {
    const session = db.sessions.find(s => !s.closed_at);
    if (!session) return;
    for (const order of orders(db).filter(o => o.status === 'confirmed')) {
      if (window.CashClosingCore.dayKey(order.confirmedAt || order.createdAt) !== session.business_date && !db.movements.some(m => m.order_id === order.id && m.session_id === session.id && m.kind === 'receipt')) continue;
      const received = db.movements.filter(m => m.order_id === order.id && m.kind === 'receipt').reduce((n,m) => n + core.cents(m.amount),0);
      const missing = core.cents(order.trustedTotal) - received;
      if (missing > 0) db.movements.push({id:crypto.randomUUID(),session_id:session.id,kind:'receipt',method:paymentMethod(order.payment),amount:missing/100,description:`Confirmação anterior · ${order.code}`,order_id:order.id,created_at:order.confirmedAt || order.createdAt,created_by:responsible,verified_at:new Date().toISOString(),verified_by:responsible});
      db.movements.filter(m => m.session_id === session.id && m.order_id === order.id && m.kind === 'receipt').forEach(m => {m.verified_at ||= new Date().toISOString();m.verified_by ||= responsible;});
    }
  }
  async function user() {
    if (!await store.isAuthenticated()) throw Error('Entre no painel para acessar o caixa.');
    if (store.mode === 'local') return 'Administrador local';
    const { data, error } = await store.client.auth.getUser();
    if (error) throw error;
    return data.user.email || data.user.id;
  }
  function preview(db, id) {
    const session = id ? db.sessions.find(s => s.id === id) : db.sessions.find(s => !s.closed_at) || null;
    const movements = db.movements.filter(m => m.session_id === session?.id);
    let pending = orders(db).filter(o => o.status === 'pending').map(o => {
      const paid = db.movements.filter(m => m.order_id === o.id && m.kind === 'receipt').reduce((n, m) => n + core.cents(m.amount), 0);
      return { id: o.id, code: o.code, customer: o.customerName, status: o.status, remaining: (core.cents(o.trustedTotal) - paid) / 100 };
    }).filter(o => o.remaining > 0);
    const latest = db.closings.filter(c => c.session_id === session?.id).sort((a,b) => b.revision - a.revision)[0] || null;
    if (session?.closed_at && latest) pending = latest.snapshot.pending.filter(o => o.status === 'pending');
    const data = { session, movements, pending, latest };
    return { ...data, fingerprint: JSON.stringify({ session, movements, pending }) };
  }
  async function rpc(action, payload = {}) {
    const responsible = await user();
    if (store.mode !== 'local') {
      const result = await store.client.rpc('cash_register', { p_action: action, p: payload });
      if (result.error) {
        if (['PGRST202', '42883'].includes(result.error.code)) throw Error('Atualização do caixa pendente: execute as migrações 08, 09 e 10 no SQL Editor do Supabase.');
        throw Error(result.error.message);
      }
      return result.data;
    }
    const run = () => {
      const db = read(), now = new Date().toISOString();
      if (action === 'preview') {syncConfirmed(db,responsible);localStorage.setItem(key,JSON.stringify(db));return preview(db, payload.session_id);}
      if (action === 'history') return db.closings.filter(c => c.business_date.startsWith(payload.month)).sort((a,b) => b.created_at.localeCompare(a.created_at));
      if (action === 'order_status') {
        if (!['pending','confirmed','cancelled'].includes(payload.status)) throw Error('Status inválido.');
        const order = orders(db).find(o => o.id === payload.id);
        if (!order) throw Error('Pedido não encontrado.');
        if (order.status === payload.status) return preview(db);
        if (order.status === 'confirmed') throw Error('Pedido confirmado não pode ser alterado. Registre a devolução como saída de caixa.');
        if (payload.status === 'confirmed') {
          const session = db.sessions.find(s => !s.closed_at);
          if (!session) throw Error('Abra o caixa antes de confirmar o recebimento do pedido.');
          const method = paymentMethod(order.payment), total = core.amount(order.trustedTotal,true);
          const received = db.movements.filter(m => m.order_id === order.id && m.kind === 'receipt').reduce((n,m) => n+core.cents(m.amount),0);
          if (received > core.cents(total)) throw Error('Recebimentos anteriores ultrapassam o total do pedido.');
          if (received < core.cents(total)) db.movements.push({id:crypto.randomUUID(),session_id:session.id,kind:'receipt',method,amount:(core.cents(total)-received)/100,description:`Pedido confirmado · ${order.code}`,order_id:order.id,created_at:now,created_by:responsible,verified_at:now,verified_by:responsible});
        }
        db.orderStates ||= {};
        db.orderStates[order.id] = {...order,status:payload.status,confirmedAt:payload.status==='confirmed'?now:null};
      } else if (action === 'open') {
        if (payload.id && db.sessions.some(s => s.id === payload.id)) return preview(db,payload.id);
        if (db.sessions.some(s => !s.closed_at)) throw Error('Já existe um caixa aberto. Feche esse expediente antes de abrir outro.');
        db.sessions.unshift({ id: payload.id || crypto.randomUUID(), business_date: window.CashClosingCore.dayKey(), opening_cash: core.amount(payload.opening_cash), opened_at: now, opened_by: responsible, closed_at: null });
        syncConfirmed(db,responsible);
      } else {
        const fresh = preview(db, payload.session_id), session = fresh.session;
        if (!session) throw Error('Abra o caixa primeiro.');
        if (action !== 'close' && session.closed_at) throw Error('Caixa fechado. Os lançamentos estão protegidos.');
        if (action === 'movement') {
          if (db.movements.some(m => m.id === payload.id)) return fresh;
          const value = core.amount(payload.amount, true);
          if (!['receipt','expense','reinforcement','withdrawal','refund'].includes(payload.kind) || !['cash','pix','card'].includes(payload.method)) throw Error('Movimentação inválida.');
          if (['reinforcement','withdrawal'].includes(payload.kind) && payload.method !== 'cash') throw Error('Reforço e sangria devem ser em dinheiro.');
          if (String(payload.description || '').trim().length < 5 || String(payload.description).trim().length > 300) throw Error('Descreva o lançamento (5 a 300 caracteres).');
          if (payload.kind === 'receipt') {
            throw Error('O recebimento é automático ao confirmar o pedido na aba Pedidos.');
          }
          if (payload.kind === 'refund') {
            const receipt = db.movements.find(m => m.id === payload.receipt_id && m.kind === 'receipt' && m.method === payload.method);
            const refunded = db.movements.filter(m => m.receipt_id === payload.receipt_id && m.kind === 'refund').reduce((n,m) => n + core.cents(m.amount),0);
            if (!receipt || core.cents(value) + refunded > core.cents(receipt.amount)) throw Error('Devolução excede o recebimento da mesma forma de pagamento.');
          }
          const movement = { id: payload.id, session_id: session.id, kind: payload.kind, method: payload.method, amount: value, description: payload.description.trim(), order_id: payload.kind === 'receipt' ? payload.order_id : null, receipt_id: payload.kind === 'refund' ? payload.receipt_id : null, created_at: now, created_by: responsible, verified_at: null };
          db.movements.push(movement);
        } else if (action === 'verify') {
          const movement = db.movements.find(m => m.id === payload.id && m.session_id === session.id && m.kind === 'receipt' && m.method !== 'cash');
          if (!movement) throw Error('Recebimento não encontrado.');
          if (!movement.verified_at) { movement.verified_at = now; movement.verified_by = responsible; }
        } else if (action === 'close') {
          if ((fresh.latest?.revision || 0) !== payload.revision || fresh.fingerprint !== payload.fingerprint) throw Error('Os dados mudaram. Confira os valores atualizados antes de fechar.');
          const summary = core.summarize(session, fresh.movements, fresh.pending);
          const values = core.closing(summary, payload, payload.revision);
          const savedSnapshot = JSON.parse(JSON.stringify(fresh)); delete savedSnapshot.latest;
          db.closings.push({ id: crypto.randomUUID(), session_id: session.id, business_date: session.business_date, revision: payload.revision + 1, ...values, expected_cash: summary.expected, responsible, created_at: now, snapshot: savedSnapshot });
          session.closed_at ||= now;
        } else throw Error('Ação inválida.');
      }
      localStorage.setItem(key, JSON.stringify(db));
      window.dispatchEvent(new CustomEvent('snoop:cash-changed'));
      return preview(db, payload.session_id);
    };
    return navigator.locks ? navigator.locks.request(key, run) : run();
  }
  window.CashRegisterStore = { rpc, user, localOrders: orders };
})();
