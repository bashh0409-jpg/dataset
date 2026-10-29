create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null
    check (char_length(trim(description)) between 10 and 10000),
  attachment_paths text[] not null default '{}'
    check (
      cardinality(attachment_paths) <= 6
      and char_length(array_to_string(attachment_paths, '')) <= 768
    ),
  diagnostics jsonb
    check (diagnostics is null or char_length(diagnostics::text) <= 8192),
  created_at timestamptz not null default now()
);

create index bug_reports_user_created_idx
  on public.bug_reports(user_id, created_at desc);

alter table public.bug_reports enable row level security;
revoke all on public.bug_reports from public, anon, authenticated;
grant insert on public.bug_reports to authenticated;

create policy "Users can submit their own bug reports"
  on public.bug_reports for insert
  to authenticated
  with check (user_id = (select auth.uid()));
