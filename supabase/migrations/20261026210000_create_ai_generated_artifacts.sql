create table if not exists public.ai_generated_artifacts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  fields jsonb not null check (
    jsonb_typeof(fields) = 'array'
    and jsonb_array_length(fields) between 1 and 25
  ),
  records jsonb not null check (
    jsonb_typeof(records) = 'array'
    and jsonb_array_length(records) between 1 and 500
  ),
  count integer not null check (count between 1 and 500),
  seed bigint not null check (seed between 0 and 2147483647),
  created_at timestamptz not null default now(),
  constraint ai_generated_artifacts_count_matches_records
    check (jsonb_array_length(records) = count)
);

create index if not exists ai_generated_artifacts_conversation_idx
  on public.ai_generated_artifacts (conversation_id, created_at);

alter table public.ai_generated_artifacts enable row level security;

drop policy if exists "Users can manage their own generated artifacts"
  on public.ai_generated_artifacts;
create policy "Users can manage their own generated artifacts"
  on public.ai_generated_artifacts for all
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.ai_conversations
      where ai_conversations.id = conversation_id
        and ai_conversations.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.ai_conversations
      where ai_conversations.id = conversation_id
        and ai_conversations.user_id = (select auth.uid())
    )
  );
