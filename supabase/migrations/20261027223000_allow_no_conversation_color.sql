alter table public.ai_conversations
  alter column color drop not null,
  alter column color drop default;
