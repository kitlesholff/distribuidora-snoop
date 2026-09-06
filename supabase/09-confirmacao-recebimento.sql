-- Execute após 08-abertura-fechamento.sql. Confirmar significa receber.
begin;
alter table public.orders add column if not exists confirmed_at timestamptz;
-- Mantém a ordem das colunas anteriores da view e acrescenta o horário recebido.
create or replace view public.orders_with_items with (security_invoker=true) as
select o.id,o.code,o.customer_name,o.delivery_type,o.address,o.payment,o.notes,
  o.client_total,o.trusted_total,o.status,o.created_at,
  coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.name,'quantity',i.quantity,'unitPrice',i.unit_price,'subtotal',i.subtotal)) filter(where i.id is not null),'[]'::jsonb) items,
  o.confirmed_at
from public.orders o left join public.order_items i on i.order_id=o.id group by o.id;

create or replace function public.order_payment_method(p_payment text)
returns text language plpgsql immutable set search_path='' as $$
begin
  if lower(trim(p_payment)) in ('dinheiro','cash') then return 'cash'; end if;
  if lower(trim(p_payment))='pix' then return 'pix'; end if;
  if lower(trim(p_payment)) like 'cartão%' or lower(trim(p_payment)) like 'cartao%' or lower(trim(p_payment))='card' then return 'card'; end if;
  raise exception 'Forma de pagamento desconhecida. Informe dinheiro, Pix ou cartão antes de confirmar.';
end;
$$;

create or replace function public.protect_confirmed_order()
returns trigger language plpgsql security definer set search_path='' as $$
declare s public.cash_sessions; received numeric;
begin
  if tg_op <> 'INSERT' and old.status='confirmed' then
    raise exception 'Pedido confirmado não pode ser alterado ou excluído. Registre a devolução como saída de caixa.';
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.status='confirmed' then
    if auth.uid() is null or public.is_admin() is not true then raise exception 'Acesso negado.'; end if;
    perform pg_advisory_xact_lock(60408,1);
    select * into s from public.cash_sessions where closed_at is null;
    if s.id is null then raise exception 'Abra o caixa antes de confirmar o recebimento do pedido.'; end if;
    new.confirmed_at := now();
    select coalesce(sum(amount),0) into received from public.cash_movements where order_id=new.id and kind='receipt';
    if received>new.trusted_total then raise exception 'Recebimentos anteriores ultrapassam o total do pedido.'; end if;
    if received<new.trusted_total then
      insert into public.cash_movements(id,session_id,kind,method,amount,description,order_id,created_by,verified_at,verified_by)
      values(gen_random_uuid(),s.id,'receipt',public.order_payment_method(new.payment),new.trusted_total-received,
        'Pedido confirmado · '||new.code,new.id,auth.uid(),now(),auth.uid());
    end if;
  else new.confirmed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_confirmed_order on public.orders;
create trigger protect_confirmed_order before insert or update or delete on public.orders
for each row execute function public.protect_confirmed_order();

create or replace function public.protect_confirmed_items()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op<>'INSERT' and exists(select 1 from public.orders where id=old.order_id and status='confirmed') then
    raise exception 'Itens de pedido confirmado não podem ser alterados.';
  end if;
  if tg_op<>'DELETE' and exists(select 1 from public.orders where id=new.order_id and status='confirmed') then
    raise exception 'Itens de pedido confirmado não podem ser alterados.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists protect_confirmed_items on public.order_items;
create trigger protect_confirmed_items before insert or update or delete on public.order_items
for each row execute function public.protect_confirmed_items();

create or replace function public.set_order_status(p_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare o public.orders;
begin
  if auth.uid() is null or public.is_admin() is not true then raise exception 'Acesso negado.'; end if;
  if p_status is null or p_status not in ('pending','confirmed','cancelled') then raise exception 'Status inválido.'; end if;
  perform pg_advisory_xact_lock(60408,1);
  select * into o from public.orders where id=p_id for update;
  if o.id is null then raise exception 'Pedido não encontrado.'; end if;
  -- Uma repetição da confirmação não recebe outra vez.
  if o.status=p_status then return to_jsonb(o); end if;
  if o.status='confirmed' then raise exception 'Pedido confirmado não pode ser alterado. Registre a devolução como saída de caixa.'; end if;
  update public.orders set status=p_status where id=p_id returning * into o;
  return to_jsonb(o);
end;
$$;
revoke all on function public.set_order_status(uuid,text) from public,anon;
grant execute on function public.set_order_status(uuid,text) to authenticated;
revoke update on public.orders from authenticated;

-- Compatibiliza os confirmados da rotina anterior apenas no caixa aberto da data.
-- Não muda comprovantes fechados nem transfere vendas antigas para a gaveta de hoje.
create or replace function public.sync_confirmed_receipts()
returns void language plpgsql security definer set search_path='' as $$
declare s public.cash_sessions; o record;
begin
  perform pg_advisory_xact_lock(60408,1);
  select * into s from public.cash_sessions where closed_at is null;
  if s.id is null then return; end if;
  for o in select ord.*,ord.trusted_total-coalesce((select sum(m.amount) from public.cash_movements m where m.order_id=ord.id and m.kind='receipt'),0) as missing
    from public.orders ord where ord.status='confirmed' and
    ((coalesce(ord.confirmed_at,ord.created_at) at time zone 'America/Manaus')::date=s.business_date
      or exists(select 1 from public.cash_movements m where m.order_id=ord.id and m.session_id=s.id and m.kind='receipt'))
  loop
    if o.missing>0 then
      insert into public.cash_movements(id,session_id,kind,method,amount,description,order_id,created_by,created_at,verified_at,verified_by)
      values(gen_random_uuid(),s.id,'receipt',public.order_payment_method(o.payment),o.missing,
        'Confirmação anterior · '||o.code,o.id,s.created_by,coalesce(o.confirmed_at,o.created_at),now(),s.created_by);
    end if;
  end loop;
  update public.cash_movements m set verified_at=now(),verified_by=s.created_by
    where m.session_id=s.id and m.kind='receipt' and m.verified_at is null
      and exists(select 1 from public.orders ord where ord.id=m.order_id and ord.status='confirmed');
end;
$$;
revoke all on function public.sync_confirmed_receipts() from public,anon,authenticated;
select public.sync_confirmed_receipts();

-- Mantém a implementação transacional do 08 como função privada.
do $$ begin
  if to_regprocedure('public.cash_register_v2(text,jsonb)') is null then
    alter function public.cash_register(text,jsonb) rename to cash_register_v2;
  end if;
end $$;
revoke all on function public.cash_register_v2(text,jsonb) from public,anon,authenticated;
create or replace function public.cash_register(p_action text,p jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; pending jsonb;
begin
  if auth.uid() is null or public.is_admin() is not true then raise exception 'Acesso negado.'; end if;
  if p_action='movement' and p->>'kind'='receipt' then
    raise exception 'O recebimento é automático ao confirmar o pedido na aba Pedidos.';
  end if;
  result := public.cash_register_v2(p_action,p);
  if p_action='open' then
    perform public.sync_confirmed_receipts();
    return public.cash_register('preview',jsonb_build_object('session_id',result->'session'->>'id'));
  end if;
  if result ? 'pending' then
    select coalesce(jsonb_agg(item),'[]') into pending from jsonb_array_elements(result->'pending') item where item->>'status'='pending';
    result := jsonb_set(result,'{pending}',pending);
    result := jsonb_set(result,'{fingerprint}',to_jsonb(md5((result-'latest'-'fingerprint')::text)));
  end if;
  return result;
end;
$$;
revoke all on function public.cash_register(text,jsonb) from public,anon;
grant execute on function public.cash_register(text,jsonb) to authenticated;
commit;
