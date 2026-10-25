create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx
  on public.workspace_members(user_id);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index workspace_invites_workspace_id_idx
  on public.workspace_invites(workspace_id);

alter table public.profiles enable row level security;
alter table public.schemas enable row level security;
alter table public.api_keys enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.usage_events enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users can manage their own schemas"
  on public.schemas for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can manage their own API keys"
  on public.api_keys for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can read their own generation jobs"
  on public.generation_jobs for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can read their own usage events"
  on public.usage_events for select
  to authenticated
  using (user_id = (select auth.uid()));

create function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = (select auth.uid())
  );
$$;

create function public.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.is_workspace_owner(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

create function public.create_workspace_with_owner(
  p_display_name text,
  p_workspace_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 80
    or char_length(trim(coalesce(p_workspace_name, ''))) not between 1 and 80 then
    raise exception 'Name must be between 1 and 80 characters';
  end if;

  insert into public.profiles (id, display_name, updated_at)
  values (v_user_id, trim(p_display_name), now())
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  insert into public.workspaces (name, owner_id)
  values (trim(p_workspace_name), v_user_id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'owner');

  return v_workspace_id;
end;
$$;

revoke all on function public.create_workspace_with_owner(text, text) from public, anon;
grant execute on function public.create_workspace_with_owner(text, text) to authenticated;

create function public.accept_workspace_invite(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v_workspace_id uuid;
  v_invite_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select id, workspace_id
    into v_invite_id, v_workspace_id
  from public.workspace_invites
  where token_hash = p_token_hash
    and accepted_at is null
    and expires_at > now()
    and lower(email) = v_user_email
  for update;

  if v_invite_id is null then
    raise exception 'Invitation is invalid, expired, already used, or for another email';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'member')
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invites
    set accepted_at = now(),
        accepted_by = v_user_id
  where id = v_invite_id;

  return v_workspace_id;
end;
$$;

revoke all on function public.accept_workspace_invite(text) from public, anon;
grant execute on function public.accept_workspace_invite(text) to authenticated;

create policy "Workspace members can read their workspaces"
  on public.workspaces for select
  to authenticated
  using (public.is_workspace_member(id));

create policy "Users can read their workspace memberships"
  on public.workspace_members for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_workspace_owner(workspace_id)
  );

create policy "Workspace owners can read their invites"
  on public.workspace_invites for select
  to authenticated
  using (public.is_workspace_owner(workspace_id));

create policy "Workspace owners can create invites"
  on public.workspace_invites for insert
  to authenticated
  with check (
    invited_by = (select auth.uid())
    and public.is_workspace_owner(workspace_id)
  );
