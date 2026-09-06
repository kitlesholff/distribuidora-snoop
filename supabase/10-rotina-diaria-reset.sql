-- Execute após 09-confirmacao-recebimento.sql.
-- Instala a rotina; NÃO executa reset nem apaga os dados existentes.
begin;
-- Cada expediente tem seu ID. Pode haver mais de um no dia, apenas um aberto.
alter table public.cash_sessions drop constraint if exists cash_sessions_business_date_key;
create index if not exists cash_sessions_business_date_idx on public.cash_sessions(business_date);

create or replace function public.cash_register(p_action text,p jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare result jsonb; pending jsonb; s public.cash_sessions; opening numeric;
begin
  if auth.uid() is null or public.is_admin() is not true then raise exception 'Acesso negado.'; end if;
  if p_action='movement' and p->>'kind'='receipt' then
    raise exception 'O recebimento é automático ao confirmar o pedido na aba Pedidos.';
  end if;
  if p_action='open' then
    perform pg_advisory_xact_lock(60408,1);
    if p->>'id' is not null then
      select * into s from public.cash_sessions where id=(p->>'id')::uuid;
      if s.id is not null then return public.cash_register('preview',jsonb_build_object('session_id',s.id)); end if;
    end if;
    if exists(select 1 from public.cash_sessions where closed_at is null) then raise exception 'Já existe um caixa aberto. Feche esse expediente antes de abrir outro.'; end if;
    opening := (p->>'opening_cash')::numeric;
    if opening is null or opening<0 or opening>99999999.99 or opening<>round(opening,2) then raise exception 'Fundo inicial inválido.'; end if;
    insert into public.cash_sessions(id,business_date,opening_cash,opened_by,created_by)
      values(coalesce((p->>'id')::uuid,gen_random_uuid()),(now() at time zone 'America/Manaus')::date,opening,
        coalesce(nullif(auth.jwt()->>'email',''),auth.uid()::text),auth.uid()) returning * into s;
    perform public.sync_confirmed_receipts();
    return public.cash_register('preview',jsonb_build_object('session_id',s.id));
  end if;
  result := public.cash_register_v2(p_action,p);
  if result ? 'pending' then
    select coalesce(jsonb_agg(item),'[]') into pending from jsonb_array_elements(result->'pending') item where item->>'status'='pending';
    result := jsonb_set(result,'{pending}',pending);
    -- Consulta padrão mostra apenas o expediente aberto. Encerrados ficam no histórico.
    if p_action='preview' and p->>'session_id' is null and result->'session'->>'closed_at' is not null then
      result := result || jsonb_build_object('session',null,'movements','[]'::jsonb,'latest',null);
    end if;
    result := jsonb_set(result,'{fingerprint}',to_jsonb(md5((result-'latest'-'fingerprint')::text)));
  end if;
  return result;
end;
$$;
revoke all on function public.cash_register(text,jsonb) from public,anon;
grant execute on function public.cash_register(text,jsonb) to authenticated;

-- Apenas o reset administrativo explícito remove também confirmados e comprovantes.
-- As proteções de edição/exclusão individual permanecem ativas.
create or replace function public.reset_operational_data(p_confirmation text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare result jsonb;
begin
  if auth.uid() is null or public.is_admin() is not true then raise exception 'Acesso negado.'; end if;
  if p_confirmation is distinct from 'ZERAR' then raise exception 'Digite ZERAR para confirmar a limpeza geral.'; end if;
  perform pg_advisory_xact_lock(60408,1);
  lock table public.orders,public.order_items,public.expenses,public.cash_sessions,
    public.cash_movements,public.cash_register_closings,public.cash_closings in access exclusive mode;
  result := jsonb_build_object(
    'orders',(select count(*) from public.orders),
    'expenses',(select count(*) from public.expenses),
    'sessions',(select count(*) from public.cash_sessions),
    'movements',(select count(*) from public.cash_movements),
    'closings',(select count(*) from public.cash_register_closings)+(select count(*) from public.cash_closings));
  -- Lista explícita, sem CASCADE: catálogo, categorias e usuários não são apagados.
  truncate table public.order_items,public.orders,public.expenses,public.cash_movements,
    public.cash_register_closings,public.cash_sessions,public.cash_closings restart identity;
  return result;
end;
$$;
revoke all on function public.reset_operational_data(text) from public,anon;
grant execute on function public.reset_operational_data(text) to authenticated;
create or replace function public.reset_operational_data()
returns jsonb language plpgsql set search_path='' as $$
begin raise exception 'Atualize o painel e confirme a limpeza geral digitando ZERAR.'; end;
$$;
revoke all on function public.reset_operational_data() from public,anon,authenticated;
commit;
