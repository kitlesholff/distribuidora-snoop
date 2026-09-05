-- Categorias administráveis do catálogo.
-- Execute após o arquivo 01-restringir-admin.sql.

create table if not exists public.product_categories (
  name text primary key,
  created_at timestamptz not null default now(),
  constraint product_categories_name_length check (length(trim(name)) between 2 and 50)
);

insert into public.product_categories (name)
select distinct trim(category)
from public.products
where length(trim(category)) >= 2
on conflict (name) do nothing;

alter table public.product_categories enable row level security;

drop policy if exists "admin consulta categorias" on public.product_categories;
drop policy if exists "admin cadastra categorias" on public.product_categories;
drop policy if exists "admin exclui categorias" on public.product_categories;

create policy "admin consulta categorias"
on public.product_categories for select to authenticated
using (public.is_admin());

create policy "admin cadastra categorias"
on public.product_categories for insert to authenticated
with check (public.is_admin());

create policy "admin exclui categorias"
on public.product_categories for delete to authenticated
using (public.is_admin());

grant select, insert, delete on public.product_categories to authenticated;

