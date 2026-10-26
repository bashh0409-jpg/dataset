create table if not exists public.pro_ai_premium_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index if not exists pro_ai_premium_requests_user_time_idx
  on public.pro_ai_premium_requests (user_id, requested_at desc);

alter table public.pro_ai_premium_requests enable row level security;
revoke all on table public.pro_ai_premium_requests from anon, authenticated;

drop function if exists public.reserve_pro_ai_premium_request();

create or replace function public.reserve_pro_ai_premium_request(
  p_included boolean
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_recent_requests bigint;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_included_requests bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;
  if p_included is null then
    raise exception 'A billing source must be specified.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pro-ai-limit:' || v_user_id::text, 0)
  );

  select current_period_start, current_period_end
    into v_period_start, v_period_end
    from public.plan_subscriptions
    where user_id = v_user_id
      and status in ('active', 'trialing')
      and current_period_end > now();

  if not found then
    raise exception 'An active Pro subscription is required.';
  end if;

  delete from public.pro_ai_premium_requests
    where user_id = v_user_id
      and requested_at <= now() - interval '3 hours';

  select count(*)
    into v_recent_requests
    from public.pro_ai_premium_requests
    where user_id = v_user_id
      and requested_at > now() - interval '3 hours';

  if v_recent_requests >= 20 then
    return 'rate_limited';
  end if;

  if p_included then
    select count(*)
      into v_included_requests
      from public.usage_events
      where user_id = v_user_id
        and event_type = 'pro_ai_request'
        and created_at >= v_period_start
        and created_at < v_period_end;

    if v_included_requests >= 50 then
      return 'monthly_limit';
    end if;

    insert into public.usage_events (user_id, event_type)
      values (v_user_id, 'pro_ai_request');
  end if;

  insert into public.pro_ai_premium_requests (user_id)
    values (v_user_id);

  return 'allowed';
end;
$$;

revoke all on function public.reserve_pro_ai_premium_request(boolean)
  from public, anon;
grant execute on function public.reserve_pro_ai_premium_request(boolean)
  to authenticated;
