-- 1. User profile
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Saved data schemas
create table public.schemas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index schemas_user_id_idx
  on public.schemas(user_id);

-- 3. API keys: never store the raw secret
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index api_keys_user_id_idx
  on public.api_keys(user_id);

-- 4. Generation history
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_id uuid references public.schemas(id) on delete set null,
  status text not null default 'completed'
    check (status in ('queued', 'running', 'completed', 'failed')),
  record_count integer not null
    check (record_count > 0),
  seed bigint,
  format text not null default 'json'
    check (format in ('json', 'csv', 'sql')),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index generation_jobs_user_created_idx
  on public.generation_jobs(user_id, created_at desc);

-- 5. Usage events
create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  job_id uuid references public.generation_jobs(id) on delete set null,
  event_type text not null,
  units bigint not null default 1 check (units > 0),
  created_at timestamptz not null default now()
);

create index usage_events_user_created_idx
  on public.usage_events(user_id, created_at desc);
