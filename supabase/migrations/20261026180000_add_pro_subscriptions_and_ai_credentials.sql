create table if not exists public.plan_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  polar_customer_id text not null,
  polar_subscription_id text not null unique,
  product_id text not null,
  status text not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  polar_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_provider_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai')),
  encrypted_api_key text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create or replace function public.sync_polar_subscription(
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
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
end;
$$;

revoke all on function public.sync_polar_subscription(
  uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz
) from public;
grant execute on function public.sync_polar_subscription(
  uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz
) to service_role;

alter table public.plan_subscriptions enable row level security;
alter table public.ai_provider_credentials enable row level security;

drop policy if exists "Users can read their own subscription"
  on public.plan_subscriptions;
create policy "Users can read their own subscription"
  on public.plan_subscriptions for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can manage their own AI provider credentials"
  on public.ai_provider_credentials;
create policy "Users can manage their own AI provider credentials"
  on public.ai_provider_credentials for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.has_active_pro_subscription()
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.plan_subscriptions
      where user_id = auth.uid()
        and status in ('active', 'trialing')
        and current_period_end > now()
  );
$$;

grant execute on function public.has_active_pro_subscription() to authenticated;

create or replace function public.reserve_pro_ai_request()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_used bigint;
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select current_period_start, current_period_end
    into v_period_start, v_period_end
    from public.plan_subscriptions
    where user_id = v_user_id
      and status in ('active', 'trialing')
      and current_period_end > now()
    for update;

  if not found then
    return 'not_pro';
  end if;

  select count(*)
    into v_used
    from public.usage_events
    where user_id = v_user_id
      and event_type = 'pro_ai_request'
      and created_at >= v_period_start
      and created_at < v_period_end;

  if v_used >= 50 then
    return 'limit_reached';
  end if;

  insert into public.usage_events (user_id, event_type)
    values (v_user_id, 'pro_ai_request');

  return 'allowed';
end;
$$;

revoke all on function public.reserve_pro_ai_request() from public;
grant execute on function public.reserve_pro_ai_request() to authenticated;
