create or replace function public.charge_workspace_credit_for_generation(
  p_workspace_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_balance integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
      from public.workspace_members
      where workspace_id = p_workspace_id
        and user_id = v_user_id
  ) then
    raise exception 'Workspace membership is required.';
  end if;

  update public.workspace_credit_balances
    set balance = balance - 1,
        updated_at = now()
    where workspace_id = p_workspace_id
      and balance > 0
    returning balance into v_balance;

  if not found then
    return null;
  end if;

  insert into public.workspace_credit_ledger (
    workspace_id, user_id, amount, reason
  )
  values (p_workspace_id, v_user_id, -1, 'generation');

  return v_balance;
end;
$$;

revoke all on function public.charge_workspace_credit_for_generation(uuid)
  from public, anon;
grant execute on function public.charge_workspace_credit_for_generation(uuid)
  to authenticated;
