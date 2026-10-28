create or replace function public.reject_self_workspace_mention_recipient()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_author_id uuid;
begin
  select author_id
    into v_author_id
    from public.workspace_mentions
    where id = new.mention_id;

  if v_author_id is not null and v_author_id = new.user_id then
    raise exception 'You cannot mention yourself.';
  end if;

  return new;
end;
$$;

revoke all on function public.reject_self_workspace_mention_recipient()
  from public, anon, authenticated;

create trigger reject_self_workspace_mention_recipient
  before insert or update of mention_id, user_id
  on public.workspace_mention_recipients
  for each row
  execute function public.reject_self_workspace_mention_recipient();
