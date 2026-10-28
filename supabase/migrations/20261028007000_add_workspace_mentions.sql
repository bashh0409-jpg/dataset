create table public.workspace_mentions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index workspace_mentions_workspace_created_idx
  on public.workspace_mentions(workspace_id, created_at desc);

create table public.workspace_mention_recipients (
  mention_id uuid not null references public.workspace_mentions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  primary key (mention_id, user_id)
);

create index workspace_mention_recipients_user_unread_idx
  on public.workspace_mention_recipients(user_id, mention_id)
  where read_at is null;

alter table public.workspace_mentions enable row level security;
alter table public.workspace_mention_recipients enable row level security;

revoke all on public.workspace_mentions from public, anon, authenticated;
revoke all on public.workspace_mention_recipients from public, anon, authenticated;
grant select on public.workspace_mentions to authenticated;
grant select on public.workspace_mention_recipients to authenticated;

create policy "Workspace members can read mentions"
  on public.workspace_mentions for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Workspace members can read mention recipients"
  on public.workspace_mention_recipients for select
  to authenticated
  using (
    exists (
      select 1
        from public.workspace_mentions as mention
        where mention.id = mention_id
          and public.is_workspace_member(mention.workspace_id)
    )
  );

create function public.create_workspace_mention(
  p_workspace_id uuid,
  p_recipient_ids uuid[],
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_mention_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_workspace_id is null
    or not public.is_workspace_member(p_workspace_id)
  then
    raise exception 'Workspace membership is required.';
  end if;

  if p_message is null
    or char_length(trim(p_message)) not between 1 and 500
  then
    raise exception 'Mention messages must be between 1 and 500 characters.';
  end if;

  if p_recipient_ids is null
    or cardinality(p_recipient_ids) < 1
    or cardinality(p_recipient_ids) > 50
    or exists (
      select 1
        from unnest(p_recipient_ids) as recipient(user_id)
        where recipient.user_id is null
           or not exists (
             select 1
               from public.workspace_members as membership
               where membership.workspace_id = p_workspace_id
                 and membership.user_id = recipient.user_id
           )
    )
    or cardinality(p_recipient_ids) <> (
      select count(distinct recipient.user_id)
        from unnest(p_recipient_ids) as recipient(user_id)
    )
  then
    raise exception 'Choose valid workspace members to mention.';
  end if;

  insert into public.workspace_mentions (
    workspace_id, author_id, message
  )
  values (
    p_workspace_id, v_user_id, trim(p_message)
  )
  returning id into v_mention_id;

  insert into public.workspace_mention_recipients (mention_id, user_id)
    select v_mention_id, recipient.user_id
      from unnest(p_recipient_ids) as recipient(user_id);

  return v_mention_id;
end;
$$;

create function public.get_workspace_mentions(p_workspace_id uuid)
returns table (
  id uuid,
  author_id uuid,
  message text,
  created_at timestamptz,
  recipient_ids uuid[],
  is_mentioned boolean,
  read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace membership is required.';
  end if;

  return query
    with recent_mentions as (
      select mention.id, mention.author_id, mention.message, mention.created_at
        from public.workspace_mentions as mention
        where mention.workspace_id = p_workspace_id
        order by mention.created_at desc
        limit 50
    )
    select mention.id,
           mention.author_id,
           mention.message,
           mention.created_at,
           coalesce(
             array_agg(recipient.user_id order by recipient.user_id)
               filter (where recipient.user_id is not null),
             '{}'::uuid[]
           ),
           bool_or(recipient.user_id = v_user_id),
           max(recipient.read_at) filter (where recipient.user_id = v_user_id)
      from recent_mentions as mention
      left join public.workspace_mention_recipients as recipient
        on recipient.mention_id = mention.id
      group by mention.id, mention.author_id, mention.message, mention.created_at
      order by mention.created_at desc;
end;
$$;

create function public.mark_workspace_mentions_read(
  p_workspace_id uuid,
  p_mention_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_updated integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace membership is required.';
  end if;

  update public.workspace_mention_recipients as recipient
    set read_at = now()
    from public.workspace_mentions as mention
    where recipient.mention_id = mention.id
      and mention.workspace_id = p_workspace_id
      and recipient.user_id = v_user_id
      and recipient.read_at is null
      and mention.id = any(p_mention_ids);

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.create_workspace_mention(uuid, uuid[], text)
  from public, anon;
revoke all on function public.get_workspace_mentions(uuid)
  from public, anon;
revoke all on function public.mark_workspace_mentions_read(uuid, uuid[])
  from public, anon;

grant execute on function public.create_workspace_mention(uuid, uuid[], text)
  to authenticated;
grant execute on function public.get_workspace_mentions(uuid)
  to authenticated;
grant execute on function public.mark_workspace_mentions_read(uuid, uuid[])
  to authenticated;
