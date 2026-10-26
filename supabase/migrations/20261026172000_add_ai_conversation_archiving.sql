alter table public.ai_conversations
  add column archived boolean not null default false;

create index ai_conversations_user_archived_pinned_updated_idx
  on public.ai_conversations(user_id, archived, pinned desc, updated_at desc);
x