(function (root) {
  'use strict';
  const cents = value => Math.round(Number(value) * 100);
  function amount(value, positive = false) {
    const n = Number(value);
    if (value === '' || value == null || !Number.isFinite(n) || n < (positive ? 0.01 : 0) || n > 99999999.99 || Math.abs(n * 100 - cents(n)) > 0.00001) throw Error('Informe um valor válido com até duas casas decimais.');
    return cents(n) / 100;
  }
  function summarize(session, movements, pending = []) {
    const sum = (kind, method) => movements.filter(m => m.kind === kind && (!method || m.method === method)).reduce((n, m) => n + cents(m.amount), 0) / 100;
    const cashIncome = sum('receipt', 'cash'), reinforcement = sum('reinforcement', 'cash');
    const cashExpenses = sum('expense', 'cash'), withdrawal = sum('withdrawal', 'cash'), refund = sum('refund', 'cash');
    const expected = (cents(session?.opening_cash || 0) + cents(cashIncome) + cents(reinforcement) - cents(cashExpenses) - cents(withdrawal) - cents(refund)) / 100;
    return { cashIncome, reinforcement, cashExpenses, withdrawal, refund, expected, salesTotal: sum('receipt'),
      pix: sum('receipt', 'pix'), card: sum('receipt', 'card'), pending,
      unverified: movements.filter(m => m.kind === 'receipt' && m.method !== 'cash' && !m.verified_at) };
  }
  function closing(summary, fields, revision = 0) {
    const counted = amount(fields.counted_cash), difference = (cents(counted) - cents(summary.expected)) / 100;
    const notes = String(fields.notes || '').trim();
    if (summary.unverified.length) throw Error('Confira os recebimentos de Pix e cartão antes de fechar.');
    if (summary.pending.length && !fields.keep_pending) throw Error('Resolva os pagamentos pendentes ou marque que permanecerão pendentes.');
    if ((difference || revision || summary.pending.length) && notes.length < 5) throw Error('Informe uma justificativa com pelo menos 5 caracteres.');
    if (notes.length > 1000) throw Error('Use até 1.000 caracteres na justificativa.');
    if (summary.expected < 0) throw Error('A gaveta está negativa. Confira as saídas e os recebimentos.');
    return { counted_cash: counted, difference, notes, keep_pending: Boolean(fields.keep_pending) };
  }
  const api = { cents, amount, summarize, closing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CashRegisterCore = api;
})(typeof window === 'undefined' ? globalThis : window);
