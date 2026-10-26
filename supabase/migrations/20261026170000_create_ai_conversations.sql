create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  messages jsonb not null default '[]'::jsonb
    check (
      case
        when jsonb_typeof(messages) = 'array'
          then jsonb_array_length(messages) <= 100
        else false
      end
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_conversations_user_updated_idx
  on public.ai_conversations(user_id, updated_at desc);

alter table public.ai_conversations enable row level security;

create policy "Users can manage their own AI conversations"
  on public.ai_conversations for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
