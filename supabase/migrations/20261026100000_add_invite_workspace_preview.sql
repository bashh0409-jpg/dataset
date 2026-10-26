create function public.get_workspace_invite_workspace_name(p_token_hash text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select w.name
  from public.workspace_invites as wi
  join public.workspaces as w on w.id = wi.workspace_id
  where wi.token_hash = p_token_hash
    and wi.accepted_at is null
    and wi.expires_at > now()
    and lower(wi.email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and (select auth.uid()) is not null
  limit 1;
$$;

revoke all on function public.get_workspace_invite_workspace_name(text)
  from public, anon;
grant execute on function public.get_workspace_invite_workspace_name(text)
  to authenticated;
