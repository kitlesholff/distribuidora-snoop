// Banco PostgreSQL em memória; nunca se conecta ao projeto Supabase.
// Instalação: npm.cmd install --prefix .test-tools --no-save --package-lock=false @electric-sql/pglite
// Execução: node tests/cash-closing-sql.cjs
const { PGlite } = require('../.test-tools/node_modules/@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const core = require('../js/cash-closing-core.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const admin = '00000000-0000-0000-0000-000000000001';
const guest = '00000000-0000-0000-0000-000000000002';

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
      create function auth.role() returns text language sql as $$ select current_user::text $$;
      create function public.is_admin() returns boolean language sql as $$ select auth.uid() = '${admin}'::uuid $$;
      grant usage on schema auth to anon, authenticated;
      set test.user_id = '${admin}';`);
    // gen_random_uuid é nativo do PostgreSQL; pgcrypto não é necessário neste teste.
    await db.exec(read('supabase/schema.sql').replace(/create extension if not exists pgcrypto;/i, ''));
    await db.exec(read('supabase/02-criar-saidas.sql').replace(/create extension if not exists pgcrypto;/i, ''));
    const migration = read('supabase/06-fechamento-caixa.sql');
    await db.exec(migration);
    await db.exec(migration);
    console.log('OK: migração instala e pode ser reexecutada.');

    await db.exec(`insert into public.orders(code,customer_name,delivery_type,address,payment,client_total,trusted_total,status,created_at) values
      ('D1','Cliente A','Retirada','Venda presencial','Dinheiro',300,300,'confirmed','2020-03-10T15:00:00Z'),
      ('P1','Cliente B','Entrega','Rua A','Pix',120,120,'confirmed','2020-03-10T20:00:00Z'),
      ('C1','Cliente C','Retirada','Venda presencial','Cartão de crédito',80,80,'confirmed','2020-03-11T03:59:59Z'),
      ('X1','Cliente D','Entrega','Rua A','Pix',25,25,'cancelled','2020-03-10T15:00:00Z'),
      ('NEXT','Cliente E','Entrega','Rua A','Pix',900,900,'confirmed','2020-03-11T04:00:00Z');
      insert into public.expenses(description,amount,spent_by,spent_at) values
      ('Embalagens',50,'Ana','2020-03-10T15:00:00Z'), ('Despesa Pix',20,'Ana','2020-03-10T16:00:00Z');
      insert into public.order_items(order_id,product_id,name,quantity,unit_price,subtotal)
      select id,'long-neck','Bebida',10,30,300 from public.orders where code='D1';
      set role authenticated;`);
    const preview = async date => (await db.query('select public.cash_closing_preview($1::date) as data', [date])).rows[0].data;
    const save = async (snap, revision = 0, overrides = {}) => {
      const p = { opening: 100, cashExpenses: 50, counted: 350, name: 'Ana', notes: '', ...overrides };
      return (await db.query('select public.save_cash_closing($1::date,$2::numeric,$3::numeric,$4::numeric,$5,$6,$7,$8::integer) as data',
        [snap.date,p.opening,p.cashExpenses,p.counted,p.name,p.notes,snap.fingerprint,revision])).rows[0].data;
    };
    let snap = await preview('2020-03-10');
    assert.deepEqual([snap.summary.orderCount,snap.summary.income,snap.summary.cashIncome,snap.summary.expensesTotal,snap.summary.balance], [4,500,300,70,430]);
    assert.equal(snap.orders.find(o => o.code === 'D1').items[0].subtotal, 300);
    const local = core.snapshot(snap.date, snap.orders, snap.expenses);
    for (const key of Object.keys(local.summary).filter(k => k !== 'payments')) assert.equal(snap.summary[key], local.summary[key], key);
    assert.equal(snap.timeZone, core.timeZone);
    console.log('OK: totais reais do banco e local concordam; limite de dia, canais e itens corretos.');
    const first = await save(snap);
    assert.equal(Number(first.expected_cash), 350);
    assert.equal(Number(first.difference), 0);
    assert.equal(first.created_by, admin);
    await assert.rejects(save(snap), /Outro fechamento/);
    await assert.rejects(save(snap, 1), /observações/);
    await assert.rejects(db.exec(`insert into public.cash_closings select * from public.cash_closings`), /permission denied/);
    await assert.rejects(db.exec(`update public.cash_closings set notes='alterado' where true`), /permission denied/);
    await assert.rejects(db.exec(`delete from public.cash_closings where true`), /permission denied/);
    console.log('OK: gravação autorizada, sem duplicidade; edição e exclusão diretas bloqueadas.');

    await db.exec(`reset role; update public.orders set trusted_total=310 where code='D1'; set role authenticated;`);
    await assert.rejects(save(snap, 1, { notes: 'Correção da venda.' }), /mudaram/);
    snap = await preview('2020-03-10');
    await assert.rejects(save(snap, 1, { cashExpenses: 71, notes: 'Teste de valor' }), /ultrapassar/);
    await assert.rejects(save(snap, 1, { opening: -1, notes: 'Teste de valor' }), /valores válidos/);
    const second = await save(snap, 1, { counted: 355, notes: 'Falta de cinco reais conferida.' });
    assert.equal(second.revision, 2);
    assert.equal(Number(second.difference), -5);
    assert.equal((await db.query('select snapshot from public.cash_closings where id=$1', [first.id])).rows[0].snapshot.summary.income, 500);
    console.log('OK: dados desatualizados recusados; correção preserva versão anterior e registra diferença.');

    await db.exec(`reset role; update public.orders set status='pending' where code='D1'; set role authenticated;`);
    const pending = await preview('2020-03-10');
    await assert.rejects(save(pending, 2, { notes: 'Tentativa com pendência' }), /pendentes/);
    await assert.rejects(preview('2999-01-01'), /data válida/);
    await db.exec(`set test.user_id='${guest}'`);
    await assert.rejects(preview('2020-03-10'), /Acesso negado/);
    await assert.rejects(save(snap, 2, { notes: 'Sem acesso' }), /Acesso negado/);
    assert.equal((await db.query('select * from public.cash_closings')).rows.length, 0);
    await db.exec(`reset role; set test.user_id=''; set role anon;`);
    await assert.rejects(preview('2020-03-10'), /permission denied/);
    console.log('OK: pendências, data futura, visitante e usuário não administrador bloqueados.');

    await db.exec(`reset role; set test.user_id='${admin}';
      insert into public.orders(code,customer_name,delivery_type,payment,client_total,trusted_total,status,created_at)
      select 'BULK'||n,'Teste','Retirada','Pix',1,1,'confirmed','2020-03-09T15:00:00Z'::timestamptz from generate_series(1,1005) n;
      set role authenticated;`);
    const bulk = await preview('2020-03-09');
    assert.equal(bulk.orders.length, 1005);
    assert.equal(bulk.summary.income, 1005);
    const empty = await preview('2020-03-08');
    assert.equal(empty.summary.orderCount, 0);
    const emptySaved = await save(empty, 0, { opening: 0, cashExpenses: 0, counted: 0 });
    assert.equal(Number(emptySaved.difference), 0);
    console.log('OK: mais de 1.000 pedidos sem corte; dia sem movimento pode ser fechado.');

    await db.exec('reset role;');
    await db.exec(read('supabase/05-controle-geral.sql'));
    await db.exec('set role authenticated;');
    await db.query('select public.reset_operational_data()');
    assert.equal((await preview('2020-03-10')).orders.length, 0);
    assert.equal((await db.query('select snapshot from public.cash_closings where id=$1', [first.id])).rows[0].snapshot.orders.length, 4);
    console.log('OK: reset isolado limpa movimentos e mantém comprovantes históricos.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
