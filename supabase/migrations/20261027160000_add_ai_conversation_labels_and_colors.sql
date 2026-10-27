alter table public.ai_conversations
  add column label text
    check (label is null or char_length(trim(label)) between 1 and 40),
  add column color text not null default 'gray'
    check (color in ('gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'));
