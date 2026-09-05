const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../js/cash-closing-core.js');
const day = '2020-03-10';
const order = (id, total, payment = 'Dinheiro', status = 'confirmed', createdAt = `${day}T15:00:00Z`) => ({
  id, code: id, customerName: 'Balcão', createdAt, status, payment, trustedTotal: total, address: 'Venda presencial', items: []
});
const expense = (amount, id = 'e1') => ({ id, amount, description: 'Embalagens', spentBy: 'Ana', spentAt: `${day}T16:00:00Z` });
const fields = { opening_cash: '100', cash_expenses: '50', counted_cash: '350', responsible: 'Ana', notes: '' };

test('dia de Alvarães: meia-noite UTC ainda pertence ao dia anterior', () => {
  assert.equal(core.dayKey('2020-03-11T03:59:59Z'), day);
  assert.equal(core.dayKey('2020-03-11T04:00:00Z'), '2020-03-11');
  const s = core.snapshot(day, [order('a', 10, 'Pix', 'confirmed', '2020-03-11T03:59:59Z'), order('b', 20, 'Pix', 'confirmed', '2020-03-11T04:00:00Z')], []);
  assert.equal(s.summary.income, 10);
});
test('conferência separa dinheiro, digital, presencial, pendente e cancelado', () => {
  const orders = [order('a', 300), { ...order('b', 120, 'Pix'), address: 'Rua A' }, order('c', 80, 'Cartão de crédito'), order('d', 25, 'Pix', 'cancelled')];
  const s = core.snapshot(day, orders, [expense(50), expense(20, 'e2')]);
  assert.deepEqual([s.summary.income, s.summary.cashIncome, s.summary.inPersonIncome, s.summary.onlineIncome, s.summary.balance], [500, 300, 380, 120, 430]);
  const r = core.reconcile(s.summary, fields);
  assert.equal(r.expected_cash, 350);
  assert.equal(r.difference, 0);
  assert.equal(s.summary.cancelledCount, 1);
});
test('centavos são somados exatamente', () => {
  const s = core.snapshot(day, [order('a', 0.1), order('b', 0.2)], []);
  assert.equal(s.summary.income, 0.3);
  assert.equal(core.reconcile(s.summary, { ...fields, opening_cash: '0', cash_expenses: '0', counted_cash: '0.30' }).difference, 0);
});
test('saídas não são descontadas duas vezes; valores inválidos são recusados', () => {
  const s = core.snapshot(day, [order('a', 300)], [expense(50)]);
  assert.equal(core.reconcile(s.summary, fields).expected_cash, 350);
  for (const changes of [{ cash_expenses: '51' }, { opening_cash: '-1' }, { counted_cash: '' }, { counted_cash: 'NaN' }, { counted_cash: '1.001' }]) {
    assert.throws(() => core.reconcile(s.summary, { ...fields, ...changes }));
  }
  assert.throws(() => core.snapshot('2020-02-30', [], []));
  assert.throws(() => core.snapshot('2999-01-01', [], []));
});
test('pendências impedem fechar e divergências/correções exigem observação', () => {
  const pending = core.snapshot(day, [order('a', 10, 'Pix', 'pending')], []);
  assert.throws(() => core.reconcile(pending.summary, { ...fields, cash_expenses: 0 }), /pendentes/);
  const s = core.snapshot(day, [order('a', 300)], [expense(50)]);
  assert.throws(() => core.reconcile(s.summary, { ...fields, counted_cash: '340' }), /observações/);
  assert.equal(core.reconcile(s.summary, { ...fields, counted_cash: '340', notes: 'Faltaram dez reais.' }).difference, -10);
  assert.throws(() => core.reconcile(s.summary, fields, 1), /observações/);
});
test('armazenamento isolado preserva versões e recusa dados alterados ou fechamento duplicado', async () => {
  const memory = new Map([
    ['snoop_orders_v1', JSON.stringify([order('a', 300)])], ['snoop_expenses_v1', JSON.stringify([expense(50)])]
  ]);
  const sandbox = { window: { CashClosingCore: core, StoreAPI: { mode: 'local', isAuthenticated: async () => true } },
    localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
    navigator: {}, crypto: require('node:crypto').webcrypto };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/cash-closing-store.js'), 'utf8'), sandbox);
  const api = sandbox.window.CashClosingStore;
  const preview = await api.preview(day);
  const first = await api.save(day, fields, preview.snapshot.fingerprint, 0);
  assert.equal(first.revision, 1);
  await assert.rejects(api.save(day, fields, preview.snapshot.fingerprint, 0), /Outro fechamento/);
  memory.set('snoop_orders_v1', JSON.stringify([order('a', 310)]));
  await assert.rejects(api.save(day, { ...fields, notes: 'Venda corrigida' }, preview.snapshot.fingerprint, 1), /mudaram/);
  const fresh = await api.preview(day);
  const second = await api.save(day, { ...fields, counted_cash: '360', notes: 'Venda corrigida.' }, fresh.snapshot.fingerprint, 1);
  assert.equal(second.revision, 2);
  assert.equal((await api.get(first.id)).snapshot.summary.income, 300);
  assert.equal((await api.history('2020-03')).length, 2);
  memory.set('snoop_orders_v1', '[]'); memory.set('snoop_expenses_v1', '[]');
  assert.equal((await api.get(first.id)).snapshot.orders.length, 1);
});
test('falha na instalação em nuvem não gera falso fechamento local', async () => {
  let writes = 0;
  const sandbox = { window: { CashClosingCore: core, StoreAPI: { mode: 'cloud', isAuthenticated: async () => true,
    client: { rpc: async () => ({ error: { code: 'PGRST202' } }) } } }, localStorage: { setItem: () => writes++ } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/cash-closing-store.js'), 'utf8'), sandbox);
  await assert.rejects(sandbox.window.CashClosingStore.save(day, fields, 'x', 0), /06-fechamento-caixa.sql/);
  assert.equal(writes, 0);
});
