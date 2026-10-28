create or replace function public.workspace_user_has_pro_access(
  p_user_id uuid,
  p_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.workspace_members as membership
      join public.workspaces as workspace
        on workspace.id = membership.workspace_id
      where membership.user_id = p_user_id
        and membership.workspace_id = p_workspace_id
        and (
          exists (
            select 1
              from public.plan_subscriptions as subscription
              where subscription.user_id = p_user_id
                and subscription.status in ('active', 'trialing')
                and subscription.current_period_end > now()
          )
          or exists (
            select 1
              from public.plan_subscriptions as subscription
              where subscription.user_id = workspace.owner_id
                and subscription.status in ('active', 'trialing')
                and subscription.current_period_end > now()
          )
          or exists (
            select 1
              from public.workspace_credit_balances as balance
              where balance.workspace_id = p_workspace_id
                and balance.balance > 0
          )
        )
  );
$$;

drop function if exists public.get_workspace_pro_access(uuid[]);

create function public.get_workspace_pro_access(
  p_workspace_ids uuid[]
)
returns table (
  workspace_id uuid,
  has_pro boolean,
  credit_balance integer
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select membership.workspace_id,
         exists (
           select 1
             from public.workspaces as workspace
             where workspace.id = membership.workspace_id
               and (
                 exists (
                   select 1
                     from public.plan_subscriptions as subscription
                     where subscription.user_id = membership.user_id
                       and subscription.status in ('active', 'trialing')
                       and subscription.current_period_end > now()
                 )
                 or exists (
                   select 1
                     from public.plan_subscriptions as subscription
                     where subscription.user_id = workspace.owner_id
                       and subscription.status in ('active', 'trialing')
                       and subscription.current_period_end > now()
                 )
               )
         ),
         coalesce(balance.balance, 0)
    from public.workspace_members as membership
    left join public.workspace_credit_balances as balance
      on balance.workspace_id = membership.workspace_id
    where membership.user_id = (select auth.uid())
      and membership.workspace_id = any(p_workspace_ids);
$$;

revoke all on function public.get_workspace_pro_access(uuid[])
  from public, anon;
grant execute on function public.get_workspace_pro_access(uuid[])
  to authenticated;

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

  if not v_has_subscription then
    update public.workspace_credit_balances
      set balance = balance - 1,
          updated_at = now()
      where workspace_id = p_workspace_id
        and balance > 0
      returning balance into v_balance;

    if not found then
      return 'credits_exhausted';
    end if;

    insert into public.workspace_credit_ledger (
      workspace_id, user_id, amount, reason
    )
    values (p_workspace_id, v_user_id, -1, 'generation');
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

drop function if exists public.get_workspace_pro_ai_usage(uuid);

create function public.get_workspace_pro_ai_usage(
  p_workspace_id uuid
)
returns table (
  used integer,
  next_available_at timestamptz,
  credit_balance integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if not public.workspace_user_has_pro_access(v_user_id, p_workspace_id) then
    raise exception 'Workspace Pro access is required.';
  end if;

  return query
    select case
             when allowance.blocked_until <= now() then 0
             else coalesce(allowance.requests_used, 0)
           end,
           case
             when allowance.blocked_until > now() then allowance.blocked_until
             else null
           end,
           coalesce(balance.balance, 0)
      from (select 1) as singleton
      left join public.pro_ai_workspace_allowances as allowance
        on allowance.user_id = v_user_id
      left join public.workspace_credit_balances as balance
        on balance.workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.get_workspace_pro_ai_usage(uuid)
  from public, anon;
grant execute on function public.get_workspace_pro_ai_usage(uuid)
  to authenticated;

drop function if exists public.reserve_pro_ai_provider_slot_for_user(
  uuid, uuid, text, text[]
);

create function public.reserve_pro_ai_provider_slot_for_user(
  p_user_id uuid,
  p_workspace_id uuid,
  p_requested_provider text,
  p_available_providers text[]
)
returns table (reservation_id uuid, provider text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_last_provider text;
  v_provider text;
  v_claude_count bigint;
  v_openai_count bigint;
  v_reservation_id uuid;
begin
  if p_user_id is null
    or not public.workspace_user_has_pro_access(p_user_id, p_workspace_id)
  then
    raise exception 'Workspace Pro access is required.';
  end if;

  if p_available_providers is null
    or cardinality(p_available_providers) = 0
    or cardinality(p_available_providers) > 2
    or exists (
      select 1
        from unnest(p_available_providers) as available(provider)
        where available.provider not in ('claude', 'openai')
    )
    or cardinality(p_available_providers) <> (
      select count(distinct available.provider)
        from unnest(p_available_providers) as available(provider)
    )
  then
    raise exception 'At least one supported provider is required.';
  end if;

  if p_requested_provider is not null
    and (
      p_requested_provider not in ('claude', 'openai')
      or not (p_requested_provider = any(p_available_providers))
    )
  then
    raise exception 'The requested provider is unavailable.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_user_id::text || ':pro-ai-provider-reservation',
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pro-ai-provider-routing', 0)
  );

  select last_provider
    into v_last_provider
    from public.pro_ai_provider_routing_state
    where singleton = true
    for update;

  delete from public.pro_ai_provider_reservations
    where expires_at <= now();

  if p_requested_provider is not null then
    v_provider := p_requested_provider;
  elsif cardinality(p_available_providers) = 1 then
    v_provider := p_available_providers[1];
  else
    select
      count(*) filter (where reservations.provider = 'claude'),
      count(*) filter (where reservations.provider = 'openai')
      into v_claude_count, v_openai_count
      from public.pro_ai_provider_reservations as reservations
      where reservations.expires_at > now();

    if v_claude_count < v_openai_count then
      v_provider := 'claude';
    elsif v_openai_count < v_claude_count then
      v_provider := 'openai';
    elsif v_last_provider = 'claude' then
      v_provider := 'openai';
    else
      v_provider := 'claude';
    end if;
  end if;

  update public.pro_ai_provider_routing_state
    set last_provider = v_provider
    where singleton = true;

  insert into public.pro_ai_provider_reservations (
    user_id,
    provider,
    expires_at
  )
  values (
    p_user_id,
    v_provider,
    now() + interval '2 minutes'
  )
  returning id into v_reservation_id;

  return query select v_reservation_id, v_provider;
end;
$$;

revoke all on function public.reserve_pro_ai_provider_slot_for_user(
  uuid, uuid, text, text[]
) from public, anon, authenticated;
grant execute on function public.reserve_pro_ai_provider_slot_for_user(
  uuid, uuid, text, text[]
) to service_role;
