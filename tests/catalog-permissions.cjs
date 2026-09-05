// Reproduz a falha de permissões em PostgreSQL isolado, sem acessar o banco real.
const { PGlite } = require('../.test-tools/node_modules/@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.products (id text primary key, available boolean);
      insert into public.products values ('visivel', true), ('oculto', false);
      alter table public.products enable row level security;
      create function public.is_admin() returns boolean language sql as
        $$ select coalesce(current_setting('test.admin', true), 'false') = 'true' $$;
      revoke all on function public.is_admin() from public;
      grant execute on function public.is_admin() to authenticated;
      grant select on public.products to anon, authenticated;
      grant insert, update, delete on public.products to authenticated;
      create policy catalogo on public.products for select
        using (available or public.is_admin());
      create policy administrador on public.products for all
        using (public.is_admin()) with check (public.is_admin());
      set role anon;
    `);
    await assert.rejects(db.query('select * from public.products'), /permission denied for function is_admin/);
    await db.exec('reset role');
    const migration = readFileSync(path.join(__dirname, '../supabase/07-catalogo-publico.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.exec('set role anon');
    assert.deepEqual((await db.query('select id from public.products')).rows, [{ id: 'visivel' }]);
    await assert.rejects(db.query('select public.is_admin()'), /permission denied/);
    await assert.rejects(db.exec("insert into public.products values ('indevido', true)"), /permission denied/);
    await db.exec("reset role; set role authenticated; set test.admin = 'false'");
    assert.deepEqual((await db.query('select id from public.products')).rows, [{ id: 'visivel' }]);
    await assert.rejects(db.exec("insert into public.products values ('indevido', true)"), /row-level security/);
    await db.exec("set test.admin = 'true'");
    assert.equal((await db.query('select * from public.products')).rows.length, 2);
    await db.exec("insert into public.products values ('novo', true); update public.products set available = false where id = 'novo'; delete from public.products where id = 'novo'");
    console.log('OK: erro reproduzido; migração repetível; catálogo público e permissões administrativas preservadas.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
