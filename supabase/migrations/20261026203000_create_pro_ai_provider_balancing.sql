create table if not exists public.pro_ai_provider_routing_state (
  singleton boolean primary key default true check (singleton),
  last_provider text not null check (last_provider in ('claude', 'openai'))
);

insert into public.pro_ai_provider_routing_state (singleton, last_provider)
values (true, 'openai')
on conflict (singleton) do nothing;

create table if not exists public.pro_ai_provider_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('claude', 'openai')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists pro_ai_provider_reservations_active_idx
  on public.pro_ai_provider_reservations (expires_at, provider);

alter table public.pro_ai_provider_routing_state enable row level security;
alter table public.pro_ai_provider_reservations enable row level security;

revoke all on table public.pro_ai_provider_routing_state from anon, authenticated;
revoke all on table public.pro_ai_provider_reservations from anon, authenticated;

create or replace function public.reserve_pro_ai_provider_slot(
  p_requested_provider text,
  p_available_providers text[]
)
returns table (reservation_id uuid, provider text)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_provider text;
  v_provider text;
  v_claude_count bigint;
  v_openai_count bigint;
  v_reservation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_available_providers is null
    or cardinality(p_available_providers) = 0
    or exists (
      select 1
      from unnest(p_available_providers) as available(provider)
      where available.provider not in ('claude', 'openai')
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
    where user_id = v_user_id
      and status in ('active', 'trialing')
      and current_period_end > now()
  ) then
    raise exception 'An active Pro subscription is required.';
  end if;

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
    v_user_id,
    v_provider,
    now() + interval '2 minutes'
  )
  returning id into v_reservation_id;

  return query select v_reservation_id, v_provider;
end;
$$;

create or replace function public.release_pro_ai_provider_slot(
  p_reservation_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  delete from public.pro_ai_provider_reservations
    where id = p_reservation_id
      and user_id = auth.uid();
end;
$$;

revoke all on function public.reserve_pro_ai_provider_slot(text, text[])
  from public, anon;
grant execute on function public.reserve_pro_ai_provider_slot(text, text[])
  to authenticated;

revoke all on function public.release_pro_ai_provider_slot(uuid)
  from public, anon;
grant execute on function public.release_pro_ai_provider_slot(uuid)
  to authenticated;
