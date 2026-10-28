create or replace function public.get_workspace_mentions(p_workspace_id uuid)
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

revoke all on function public.get_workspace_mentions(uuid)
  from public, anon;
grant execute on function public.get_workspace_mentions(uuid)
  to authenticated;
