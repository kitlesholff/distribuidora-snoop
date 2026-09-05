(function (root) {
  'use strict';
  const timeZone = 'America/Manaus';
  const cents = value => Math.round(Number(value) * 100);
  function dayKey(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
    const part = type => parts.find(item => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function validDay(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  }
  function snapshot(date, allOrders, allExpenses) {
    if (!validDay(date) || date > dayKey()) throw new Error('Selecione uma data válida, até hoje.');
    const orders = allOrders.filter(o => dayKey(o.createdAt || o.created_at) === date).map(o => ({
      id: o.id, code: o.code, customerName: o.customerName ?? o.customer_name,
      createdAt: o.createdAt || o.created_at, status: o.status, address: o.address || '',
      payment: o.payment?.trim() || 'Não informado', notes: o.notes || '',
      items: o.items || [], trustedTotal: Number(o.trustedTotal ?? o.trusted_total)
    })).sort((a, b) => a.id.localeCompare(b.id));
    const expenses = allExpenses.filter(e => dayKey(e.spentAt || e.spent_at || e.createdAt) === date).map(e => ({
      id: e.id, description: e.description, amount: Number(e.amount),
      spentBy: e.spentBy ?? e.spent_by, spentAt: e.spentAt || e.spent_at || e.createdAt
    })).sort((a, b) => a.id.localeCompare(b.id));
    const sum = (rows, key) => rows.reduce((total, row) => total + cents(row[key]), 0) / 100;
    const confirmed = orders.filter(o => o.status === 'confirmed');
    const pending = orders.filter(o => o.status === 'pending');
    const payments = new Map();
    confirmed.forEach(o => {
      const group = payments.get(o.payment) || { name: o.payment, count: 0, value: 0 };
      group.count++; group.value += cents(o.trustedTotal); payments.set(o.payment, group);
    });
    const income = sum(confirmed, 'trustedTotal'), expensesTotal = sum(expenses, 'amount');
    return { date, timeZone, orders, expenses, fingerprint: JSON.stringify({ orders, expenses }), summary: {
      orderCount: orders.length, confirmedCount: confirmed.length, pendingCount: pending.length,
      cancelledCount: orders.filter(o => o.status === 'cancelled').length,
      income, expensesTotal, balance: (cents(income) - cents(expensesTotal)) / 100,
      pendingTotal: sum(pending, 'trustedTotal'),
      cashIncome: sum(confirmed.filter(o => o.payment.toLowerCase() === 'dinheiro'), 'trustedTotal'),
      inPersonIncome: sum(confirmed.filter(o => o.address === 'Venda presencial'), 'trustedTotal'),
      onlineIncome: sum(confirmed.filter(o => o.address !== 'Venda presencial'), 'trustedTotal'),
      payments: [...payments.values()].map(p => ({ name: p.name, count: p.count, total: p.value / 100 }))
    } };
  }
  function reconcile(summary, fields, revision = 0) {
    const values = ['opening_cash', 'cash_expenses', 'counted_cash'].map(key => {
      const value = Number(fields[key]);
      if (fields[key] === '' || fields[key] == null || !Number.isFinite(value) || value < 0 || value > 9999999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.0001) {
        throw new Error('Informe valores válidos, com até duas casas decimais.');
      }
      return cents(value);
    });
    const [opening, cashExpenses, counted] = values;
    if (cashExpenses > cents(summary.expensesTotal)) throw new Error('As saídas em dinheiro não podem ultrapassar o total de saídas do dia.');
    if (summary.pendingCount) throw new Error('Confirme ou cancele os pedidos pendentes deste dia antes de fechar o caixa.');
    const responsible = (fields.responsible || '').trim(), notes = (fields.notes || '').trim();
    if (responsible.length < 2 || responsible.length > 100) throw new Error('Informe o nome do responsável (2 a 100 caracteres).');
    const expected = opening + cents(summary.cashIncome) - cashExpenses, difference = counted - expected;
    if (expected < 0) throw new Error('O dinheiro inicial e as vendas não cobrem as saídas em dinheiro. Confira os valores.');
    if ((difference !== 0 || revision > 0) && notes.length < 5) throw new Error('Explique a diferença ou o motivo da correção nas observações (mínimo 5 caracteres).');
    if (notes.length > 1000) throw new Error('Use até 1.000 caracteres nas observações.');
    return { opening_cash: opening / 100, cash_expenses: cashExpenses / 100, counted_cash: counted / 100,
      expected_cash: expected / 100, difference: difference / 100, responsible, notes };
  }
  const api = { timeZone, cents, dayKey, validDay, snapshot, reconcile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CashClosingCore = api;
})(typeof window === 'undefined' ? globalThis : window);
