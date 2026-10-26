create or replace function public.reserve_pro_ai_provider_slot_for_user(
  p_user_id uuid,
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
  if p_user_id is null then
    raise exception 'User is required.';
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

  if not exists (
    select 1
    from public.plan_subscriptions
    where user_id = p_user_id
      and status in ('active', 'trialing')
      and current_period_end > now()
  ) then
    raise exception 'An active Pro subscription is required.';
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

create or replace function public.release_pro_ai_provider_slot_for_user(
  p_user_id uuid,
  p_reservation_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.pro_ai_provider_reservations
    where id = p_reservation_id
      and user_id = p_user_id;
end;
$$;

revoke all on table public.pro_ai_provider_routing_state
  from public, anon, authenticated;
revoke all on table public.pro_ai_provider_reservations
  from public, anon, authenticated;

revoke all on function public.reserve_pro_ai_provider_slot(text, text[])
  from public, anon, authenticated, service_role;
revoke all on function public.release_pro_ai_provider_slot(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reserve_pro_ai_provider_slot_for_user(
  uuid, text, text[]
) from public, anon, authenticated;
revoke all on function public.release_pro_ai_provider_slot_for_user(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.reserve_pro_ai_provider_slot_for_user(
  uuid, text, text[]
) to service_role;
grant execute on function public.release_pro_ai_provider_slot_for_user(uuid, uuid)
  to service_role;

revoke all on function public.sync_polar_subscription(
  uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.sync_polar_subscription(
  uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz
) to service_role;

revoke all on function public.claim_polar_checkout(uuid, text)
  from public, anon, authenticated;
revoke all on function public.reclaim_polar_checkout(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.save_polar_checkout(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.apply_polar_subscription_webhook(
  text, text, uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_polar_checkout(uuid, text) to service_role;
grant execute on function public.reclaim_polar_checkout(uuid, uuid) to service_role;
grant execute on function public.save_polar_checkout(uuid, uuid, text, text, timestamptz)
  to service_role;
grant execute on function public.apply_polar_subscription_webhook(
  text, text, uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz
) to service_role;

revoke all on function public.reserve_pro_ai_premium_request(boolean)
  from public, anon;
grant execute on function public.reserve_pro_ai_premium_request(boolean)
  to authenticated;

revoke all on function public.reserve_pro_ai_request()
  from public, anon;
grant execute on function public.reserve_pro_ai_request()
  to authenticated;

revoke all on function public.has_active_pro_subscription()
  from public, anon;
grant execute on function public.has_active_pro_subscription()
  to authenticated;

revoke all on function public.is_workspace_member(uuid)
  from public, anon;
grant execute on function public.is_workspace_member(uuid)
  to authenticated;
revoke all on function public.is_workspace_owner(uuid)
  from public, anon;
grant execute on function public.is_workspace_owner(uuid)
  to authenticated;
revoke all on function public.create_workspace_with_owner(text, text)
  from public, anon;
grant execute on function public.create_workspace_with_owner(text, text)
  to authenticated;
revoke all on function public.accept_workspace_invite(text)
  from public, anon;
grant execute on function public.accept_workspace_invite(text)
  to authenticated;
revoke all on function public.get_workspace_invite_workspace_name(text)
  from public, anon;
grant execute on function public.get_workspace_invite_workspace_name(text)
  to authenticated;
revoke all on function public.get_workspace_members(uuid)
  from public, anon;
grant execute on function public.get_workspace_members(uuid)
  to authenticated;
