alter table public.ai_conversations
  add column pinned boolean not null default false;

create index ai_conversations_user_pinned_updated_idx
  on public.ai_conversations(user_id, pinned desc, updated_at desc);
