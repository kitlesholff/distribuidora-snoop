-- Habilita o reset protegido do histórico operacional.
-- Execute no SQL Editor do Supabase. Reexecutar apenas atualiza esta função.

create or replace function public.reset_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_orders integer;
  deleted_expenses integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Acesso negado.';
  end if;

  select count(*) into deleted_orders from public.orders;
  select count(*) into deleted_expenses from public.expenses;

  -- Os itens são excluídos automaticamente pelo ON DELETE CASCADE.
  -- A condição explícita informa ao safeupdate que a exclusão total é intencional.
  delete from public.orders where true;
  delete from public.expenses where true;

  return jsonb_build_object(
    'orders', deleted_orders,
    'expenses', deleted_expenses
  );
end;
$$;

revoke all on function public.reset_operational_data() from public;
revoke all on function public.reset_operational_data() from anon;
grant execute on function public.reset_operational_data() to authenticated;
