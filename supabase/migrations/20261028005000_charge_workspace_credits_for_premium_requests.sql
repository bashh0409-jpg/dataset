create or replace function public.reserve_workspace_pro_ai_request(
  p_workspace_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_owner_id uuid;
  v_has_subscription boolean;
  v_requests_used integer;
  v_blocked_until timestamptz;
  v_balance integer;
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  select workspace.owner_id
    into v_workspace_owner_id
    from public.workspace_members as membership
    join public.workspaces as workspace
      on workspace.id = membership.workspace_id
    where membership.user_id = v_user_id
      and membership.workspace_id = p_workspace_id;

  if not found then
    return 'not_pro';
  end if;

  select exists (
    select 1
      from public.plan_subscriptions as subscription
      where subscription.user_id in (v_user_id, v_workspace_owner_id)
        and subscription.status in ('active', 'trialing')
        and subscription.current_period_end > now()
  )
    into v_has_subscription;

  if not v_has_subscription and not exists (
    select 1
      from public.workspace_credit_balances as balance
      where balance.workspace_id = p_workspace_id
        and balance.balance > 0
  ) then
    return 'not_pro';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workspace-pro-ai:' || v_user_id::text, 0)
  );

  insert into public.pro_ai_workspace_allowances (user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

  select requests_used, blocked_until
    into v_requests_used, v_blocked_until
    from public.pro_ai_workspace_allowances
    where user_id = v_user_id
    for update;

  if v_blocked_until > now() then
    return 'rate_limited';
  end if;

  if v_blocked_until is not null then
    v_requests_used := 0;
  end if;

  update public.workspace_credit_balances
    set balance = balance - 1,
        updated_at = now()
    where workspace_id = p_workspace_id
      and balance > 0
    returning balance into v_balance;

  if found then
    insert into public.workspace_credit_ledger (
      workspace_id, user_id, amount, reason
    )
    values (p_workspace_id, v_user_id, -1, 'generation');
  elsif not v_has_subscription then
    return 'credits_exhausted';
  end if;

  v_requests_used := v_requests_used + 1;

  update public.pro_ai_workspace_allowances
    set requests_used = v_requests_used,
        blocked_until = case
          when v_requests_used >= 50 then now() + interval '4 hours'
          else null
        end,
        updated_at = now()
    where user_id = v_user_id;

  return 'allowed';
end;
$$;
