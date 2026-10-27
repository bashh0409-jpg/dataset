create table if not exists public.polar_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.polar_webhook_events enable row level security;
revoke all on public.polar_webhook_events from public, anon, authenticated;
grant all on public.polar_webhook_events to service_role;
