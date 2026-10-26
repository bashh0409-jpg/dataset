create function public.get_workspace_members(p_workspace_id uuid)
returns table (
  member_id uuid,
  member_name text,
  member_email text,
  member_role text,
  member_joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace membership is required';
  end if;

  return query
  select
    wm.user_id,
    p.display_name,
    u.email::text,
    wm.role,
    wm.joined_at
  from public.workspace_members as wm
  join auth.users as u on u.id = wm.user_id
  left join public.profiles as p on p.id = wm.user_id
  where wm.workspace_id = p_workspace_id
  order by
    case when wm.role = 'owner' then 0 else 1 end,
    p.display_name nulls last,
    u.email;
end;
$$;

revoke all on function public.get_workspace_members(uuid) from public, anon;
grant execute on function public.get_workspace_members(uuid) to authenticated;
