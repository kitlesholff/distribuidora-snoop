-- Execute no SQL Editor do projeto Supabase.
-- Corrige: permission denied for function is_admin ao consultar o catálogo.
-- As políticas administrativas mantêm suas condições, mas deixam de ser
-- avaliadas para visitantes. Não concede execução de is_admin ao público.
begin;

do $$
declare
  policy_row record;
  target_roles text;
begin
  for policy_row in
    select * from pg_policies
    where schemaname = 'public' and tablename = 'products'
      and (coalesce(qual, '') ~ '\mis_admin\M'
        or coalesce(with_check, '') ~ '\mis_admin\M')
      and roles && array['public', 'anon']::name[]
  loop
    select string_agg(quote_ident(role_name), ', ' order by role_name)
    into target_roles
    from (
      select distinct case when role_item in ('public', 'anon')
        then 'authenticated' else role_item::text end as role_name
      from unnest(policy_row.roles) as role_item
    ) as adjusted_roles;

    execute format('alter policy %I on public.products to %s',
      policy_row.policyname, target_roles);
  end loop;
end;
$$;

drop policy if exists "catalogo visitante" on public.products;
create policy "catalogo visitante" on public.products
  for select to anon using (available = true);
grant select on public.products to anon;

commit;
