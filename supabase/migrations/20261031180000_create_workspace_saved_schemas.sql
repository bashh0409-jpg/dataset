create table public.workspace_saved_schemas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  definition jsonb not null
    check (pg_column_size(definition) <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workspace_saved_schemas_name_unique
  on public.workspace_saved_schemas(workspace_id, lower(name));
create index workspace_saved_schemas_updated_idx
  on public.workspace_saved_schemas(workspace_id, updated_at desc);

alter table public.workspace_saved_schemas enable row level security;

create policy "Workspace members can read saved schemas"
  on public.workspace_saved_schemas for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Workspace members can create saved schemas"
  on public.workspace_saved_schemas for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_workspace_member(workspace_id)
  );

create policy "Schema creators and workspace owners can update saved schemas"
  on public.workspace_saved_schemas for update
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      created_by = (select auth.uid())
      or public.is_workspace_owner(workspace_id)
    )
  )
  with check (
    public.is_workspace_member(workspace_id)
    and (
      created_by = (select auth.uid())
      or public.is_workspace_owner(workspace_id)
    )
  );

create policy "Schema creators and workspace owners can delete saved schemas"
  on public.workspace_saved_schemas for delete
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      created_by = (select auth.uid())
      or public.is_workspace_owner(workspace_id)
    )
  );

grant select, insert, update, delete
  on public.workspace_saved_schemas to authenticated;
revoke all on public.workspace_saved_schemas from anon;
