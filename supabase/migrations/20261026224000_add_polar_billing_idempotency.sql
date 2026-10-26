create table if not exists public.polar_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  polar_checkout_id text unique,
  checkout_url text,
  status text not null default 'creating'
    check (status in ('creating', 'open', 'completed', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint polar_checkout_attempt_session_data
    check (
      (status = 'open' and polar_checkout_id is not null
        and checkout_url is not null and expires_at is not null)
      or status <> 'open'
    )
);

create unique index if not exists polar_checkout_attempts_one_pending_per_user
  on public.polar_checkout_attempts (user_id, product_id)
  where status in ('creating', 'open');

alter table public.polar_checkout_attempts enable row level security;
revoke all on public.polar_checkout_attempts from public, anon, authenticated;
grant all on public.polar_checkout_attempts to service_role;

create table if not exists public.polar_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.polar_webhook_events enable row level security;
revoke all on public.polar_webhook_events from public, anon, authenticated;
grant all on public.polar_webhook_events to service_role;

create or replace function public.claim_polar_checkout(
  p_user_id uuid,
  p_product_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_attempt public.polar_checkout_attempts%rowtype;
begin
  if p_user_id is null or nullif(trim(p_product_id), '') is null then
    raise exception 'Invalid Polar checkout claim.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':polar-checkout:' || p_product_id, 0)
  );

  if exists (
    select 1
    from public.plan_subscriptions
    where user_id = p_user_id
      and status in ('active', 'trialing')
      and current_period_end > now()
  ) then
    return jsonb_build_object('status', 'subscribed');
  end if;

  select *
    into v_attempt
    from public.polar_checkout_attempts
    where user_id = p_user_id
      and product_id = p_product_id
      and status in ('creating', 'open')
    for update;

  if found and v_attempt.status = 'open' then
    if v_attempt.expires_at > now() then
      return jsonb_build_object(
        'status', 'existing',
        'attempt_id', v_attempt.id,
        'checkout_url', v_attempt.checkout_url
      );
    end if;

    update public.polar_checkout_attempts
      set status = 'expired', updated_at = now()
      where id = v_attempt.id;
  elsif found then
    return jsonb_build_object(
      'status',
      case
        when v_attempt.updated_at < now() - interval '5 minutes'
          then 'stale'
        else 'in_progress'
      end,
      'attempt_id', v_attempt.id
    );
  end if;

  insert into public.polar_checkout_attempts (user_id, product_id)
    values (p_user_id, p_product_id)
    returning * into v_attempt;

  return jsonb_build_object('status', 'claimed', 'attempt_id', v_attempt.id);
end;
$$;

create or replace function public.reclaim_polar_checkout(
  p_user_id uuid,
  p_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.polar_checkout_attempts
    set updated_at = now()
    where id = p_attempt_id
      and user_id = p_user_id
      and status = 'creating'
      and updated_at < now() - interval '5 minutes';

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.save_polar_checkout(
  p_user_id uuid,
  p_attempt_id uuid,
  p_checkout_id text,
  p_checkout_url text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if nullif(trim(p_checkout_id), '') is null
    or nullif(trim(p_checkout_url), '') is null
    or p_expires_at <= now()
  then
    return false;
  end if;

  update public.polar_checkout_attempts
    set polar_checkout_id = p_checkout_id,
        checkout_url = p_checkout_url,
        expires_at = p_expires_at,
        status = 'open',
        updated_at = now()
    where id = p_attempt_id
      and user_id = p_user_id
      and status = 'creating';

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.apply_polar_subscription_webhook(
  p_webhook_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_polar_customer_id text,
  p_polar_subscription_id text,
  p_product_id text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_polar_modified_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_webhook_event_id), '') is null
    or p_user_id is null
    or nullif(trim(p_polar_subscription_id), '') is null
  then
    raise exception 'Invalid Polar subscription webhook.';
  end if;

  insert into public.polar_webhook_events (event_id, event_type)
    values (p_webhook_event_id, p_event_type)
    on conflict (event_id) do nothing;

  if not found then
    return false;
  end if;

  insert into public.plan_subscriptions (
    user_id,
    polar_customer_id,
    polar_subscription_id,
    product_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    polar_modified_at
  )
  values (
    p_user_id,
    p_polar_customer_id,
    p_polar_subscription_id,
    p_product_id,
    p_status,
    p_current_period_start,
    p_current_period_end,
    p_cancel_at_period_end,
    p_polar_modified_at
  )
  on conflict (user_id) do update set
    polar_customer_id = excluded.polar_customer_id,
    polar_subscription_id = excluded.polar_subscription_id,
    product_id = excluded.product_id,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    polar_modified_at = excluded.polar_modified_at,
    updated_at = now()
  where plan_subscriptions.polar_modified_at is null
     or (
       excluded.polar_modified_at is not null
       and excluded.polar_modified_at >= plan_subscriptions.polar_modified_at
     );

  update public.polar_checkout_attempts
    set status = 'completed', updated_at = now()
    where user_id = p_user_id
      and product_id = p_product_id
      and status in ('creating', 'open');

  return true;
end;
$$;

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
