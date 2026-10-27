create table if not exists public.free_ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index if not exists free_ai_requests_user_time_idx
  on public.free_ai_requests (user_id, requested_at desc);

alter table public.free_ai_requests enable row level security;
revoke all on table public.free_ai_requests from public, anon, authenticated;

create or replace function public.reserve_free_ai_request()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_recent_requests bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('free-ai-limit:' || v_user_id::text, 0)
  );

  delete from public.free_ai_requests
    where user_id = v_user_id
      and requested_at <= now() - interval '24 hours';

  select count(*)
    into v_recent_requests
    from public.free_ai_requests
    where user_id = v_user_id
      and requested_at > now() - interval '24 hours';

  if v_recent_requests >= 50 then
    return 'rate_limited';
  end if;

  insert into public.free_ai_requests (user_id)
    values (v_user_id);

  return 'allowed';
end;
$$;

revoke all on function public.reserve_free_ai_request() from public, anon;
grant execute on function public.reserve_free_ai_request() to authenticated;
