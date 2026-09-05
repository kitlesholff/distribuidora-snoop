-- Registra saídas financeiras visíveis somente para o administrador.

create extension if not exists pgcrypto;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null check (length(trim(description)) between 2 and 300),
  amount numeric(10,2) not null check (amount > 0),
  spent_by text not null check (length(trim(spent_by)) between 2 and 100),
  spent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

drop policy if exists "admin consulta saidas" on public.expenses;
drop policy if exists "admin cadastra saidas" on public.expenses;
drop policy if exists "admin exclui saidas" on public.expenses;

create policy "admin consulta saidas"
on public.expenses for select to authenticated
using (public.is_admin());

create policy "admin cadastra saidas"
on public.expenses for insert to authenticated
with check (public.is_admin());

create policy "admin exclui saidas"
on public.expenses for delete to authenticated
using (public.is_admin());

grant select, insert, delete on public.expenses to authenticated;
