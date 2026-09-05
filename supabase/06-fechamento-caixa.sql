-- Fechamento diário: execute TODO este arquivo no SQL Editor do Supabase.
-- Requer schema.sql, 01-restringir-admin.sql e 02-criar-saidas.sql já instalados.
-- Cria relatórios e funções; não fecha o caixa nem apaga registros.
begin;

create table if not exists public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  closing_date date not null,
  revision integer not null check (revision > 0),
  responsible text not null check (length(trim(responsible)) between 2 and 100),
  opening_cash numeric(12,2) not null check (opening_cash >= 0),
  cash_expenses numeric(12,2) not null check (cash_expenses >= 0),
  counted_cash numeric(12,2) not null check (counted_cash >= 0),
  expected_cash numeric(12,2) not null check (expected_cash >= 0),
  difference numeric(12,2) not null,
  notes text not null default '' check (length(notes) <= 1000),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  unique (closing_date, revision)
);

alter table public.cash_closings enable row level security;
drop policy if exists "admin consulta fechamentos" on public.cash_closings;
create policy "admin consulta fechamentos" on public.cash_closings
  for select to authenticated using (public.is_admin());
revoke all on public.cash_closings from anon, authenticated;
grant select on public.cash_closings to authenticated;

create or replace function public.cash_closing_preview(p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  start_at timestamptz;
  end_at timestamptz;
  day_orders jsonb;
  day_expenses jsonb;
  totals jsonb;
  payments jsonb;
  expense_total numeric;
begin
  if auth.uid() is null or public.is_admin() is not true then raise exception 'Acesso negado.'; end if;
  if p_date is null or p_date > (now() at time zone 'America/Manaus')::date then
    raise exception 'Selecione uma data válida, até hoje.';
  end if;
  start_at := p_date::timestamp at time zone 'America/Manaus';
  end_at := (p_date + 1)::timestamp at time zone 'America/Manaus';

  -- Uma única consulta mantém pedidos e saídas na mesma visão do banco.
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'code', o.code, 'customerName', o.customer_name,
      'createdAt', o.created_at, 'status', o.status, 'address', o.address,
      'payment', coalesce(nullif(trim(o.payment), ''), 'Não informado'),
      'notes', o.notes, 'trustedTotal', o.trusted_total,
      'items', coalesce((select jsonb_agg(jsonb_build_object('productId', i.product_id,
        'name', i.name, 'quantity', i.quantity, 'unitPrice', i.unit_price, 'subtotal', i.subtotal) order by i.id)
        from public.order_items i where i.order_id = o.id), '[]'::jsonb)
    ) order by o.id) from public.orders o where o.created_at >= start_at and o.created_at < end_at), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'description', e.description, 'amount', e.amount,
      'spentBy', e.spent_by, 'spentAt', e.spent_at
    ) order by e.id) from public.expenses e where e.spent_at >= start_at and e.spent_at < end_at), '[]'::jsonb)
  into day_orders, day_expenses;

  select coalesce(sum((e->>'amount')::numeric), 0) into expense_total from jsonb_array_elements(day_expenses) e;
  select jsonb_build_object(
    'orderCount', count(*),
    'confirmedCount', count(*) filter (where o->>'status' = 'confirmed'),
    'pendingCount', count(*) filter (where o->>'status' = 'pending'),
    'cancelledCount', count(*) filter (where o->>'status' = 'cancelled'),
    'income', coalesce(sum((o->>'trustedTotal')::numeric) filter (where o->>'status' = 'confirmed'), 0),
    'pendingTotal', coalesce(sum((o->>'trustedTotal')::numeric) filter (where o->>'status' = 'pending'), 0),
    'cashIncome', coalesce(sum((o->>'trustedTotal')::numeric) filter (where o->>'status' = 'confirmed' and lower(o->>'payment') = 'dinheiro'), 0),
    'inPersonIncome', coalesce(sum((o->>'trustedTotal')::numeric) filter (where o->>'status' = 'confirmed' and o->>'address' = 'Venda presencial'), 0),
    'onlineIncome', coalesce(sum((o->>'trustedTotal')::numeric) filter (where o->>'status' = 'confirmed' and o->>'address' <> 'Venda presencial'), 0)
  ) into totals from jsonb_array_elements(day_orders) o;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.name), '[]'::jsonb) into payments from (
    select o->>'payment' as name, count(*) as count, sum((o->>'trustedTotal')::numeric) as total
    from jsonb_array_elements(day_orders) o where o->>'status' = 'confirmed' group by o->>'payment'
  ) p;
  totals := totals || jsonb_build_object('expensesTotal', expense_total,
    'balance', (totals->>'income')::numeric - expense_total, 'payments', payments);
  return jsonb_build_object('date', p_date, 'timeZone', 'America/Manaus', 'orders', day_orders,
    'expenses', day_expenses, 'summary', totals, 'fingerprint', md5(day_orders::text || day_expenses::text));
end;
$$;

create or replace function public.save_cash_closing(
  p_date date, p_opening_cash numeric, p_cash_expenses numeric, p_counted_cash numeric,
  p_responsible text, p_notes text, p_fingerprint text, p_revision integer
)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  current_snapshot jsonb;
  last_revision integer;
  expected numeric;
  difference_value numeric;
  saved public.cash_closings;
begin
  if auth.uid() is null or public.is_admin() is not true then raise exception 'Acesso negado.'; end if;
  if p_date is null then raise exception 'Informe a data.'; end if;
  -- Serializa fechamentos da mesma data e confere a versão que o operador abriu.
  perform pg_advisory_xact_lock(60406, p_date - date '2000-01-01');
  select coalesce(max(revision), 0) into last_revision from public.cash_closings where closing_date = p_date;
  if p_revision is distinct from last_revision then raise exception 'Outro fechamento foi salvo. Atualize a conferência.'; end if;
  -- A gravação dura uma transação curta. Pedidos e saídas não mudam no meio dela.
  lock table public.orders, public.order_items, public.expenses in share mode;
  current_snapshot := public.cash_closing_preview(p_date);
  if p_fingerprint is distinct from current_snapshot->>'fingerprint' then
    raise exception 'Os pedidos ou as saídas mudaram. Atualize e confira os valores novamente.';
  end if;
  if (current_snapshot->'summary'->>'pendingCount')::integer > 0 then
    raise exception 'Confirme ou cancele os pedidos pendentes deste dia antes de fechar o caixa.';
  end if;
  if p_opening_cash is null or p_cash_expenses is null or p_counted_cash is null
    or p_opening_cash < 0 or p_cash_expenses < 0 or p_counted_cash < 0
    or p_opening_cash > 9999999999.99 or p_cash_expenses > 9999999999.99 or p_counted_cash > 9999999999.99
    or p_opening_cash <> round(p_opening_cash, 2) or p_cash_expenses <> round(p_cash_expenses, 2)
    or p_counted_cash <> round(p_counted_cash, 2) then
    raise exception 'Informe valores válidos, com até duas casas decimais.';
  end if;
  if p_cash_expenses > (current_snapshot->'summary'->>'expensesTotal')::numeric then
    raise exception 'As saídas em dinheiro não podem ultrapassar o total de saídas do dia.';
  end if;
  if coalesce(length(trim(p_responsible)), 0) not between 2 and 100 then raise exception 'Informe o nome do responsável (2 a 100 caracteres).'; end if;
  expected := p_opening_cash + (current_snapshot->'summary'->>'cashIncome')::numeric - p_cash_expenses;
  difference_value := p_counted_cash - expected;
  if expected < 0 then raise exception 'O dinheiro inicial e as vendas não cobrem as saídas em dinheiro. Confira os valores.'; end if;
  if (difference_value <> 0 or last_revision > 0) and coalesce(length(trim(p_notes)), 0) < 5 then
    raise exception 'Explique a diferença ou o motivo da correção nas observações (mínimo 5 caracteres).';
  end if;
  insert into public.cash_closings (closing_date, revision, responsible, opening_cash, cash_expenses,
    counted_cash, expected_cash, difference, notes, snapshot, created_by)
  values (p_date, last_revision + 1, trim(p_responsible), p_opening_cash, p_cash_expenses,
    p_counted_cash, expected, difference_value, coalesce(trim(p_notes), ''), current_snapshot, auth.uid())
  returning * into saved;
  return to_jsonb(saved);
end;
$$;

revoke all on function public.cash_closing_preview(date) from public, anon;
revoke all on function public.save_cash_closing(date, numeric, numeric, numeric, text, text, text, integer) from public, anon;
grant execute on function public.cash_closing_preview(date) to authenticated;
grant execute on function public.save_cash_closing(date, numeric, numeric, numeric, text, text, text, integer) to authenticated;
commit;
