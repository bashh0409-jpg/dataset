alter table public.ai_conversations
  add column workspace_id uuid references public.workspaces(id) on delete cascade;

update public.ai_conversations as conversations
set workspace_id = (
  select membership.workspace_id
  from public.workspace_members as membership
  where membership.user_id = conversations.user_id
  order by (membership.role = 'owner') desc, membership.joined_at asc
  limit 1
)
where conversations.workspace_id is null
  and exists (
    select 1
    from public.workspace_members as membership
    where membership.user_id = conversations.user_id
  );

create index ai_conversations_workspace_updated_idx
  on public.ai_conversations(workspace_id, updated_at desc);

drop policy if exists "Users can manage their own AI conversations"
  on public.ai_conversations;

create policy "Workspace members can read conversations"
  on public.ai_conversations for select
  to authenticated
  using (
    (workspace_id is not null and public.is_workspace_member(workspace_id))
    or (workspace_id is null and user_id = (select auth.uid()))
  );

create policy "Workspace members can create conversations"
  on public.ai_conversations for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

create policy "Workspace members can update conversations"
  on public.ai_conversations for update
  to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  )
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

create policy "Workspace owners can delete conversations"
  on public.ai_conversations for delete
  to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_owner(workspace_id)
  );

revoke update on public.ai_conversations from authenticated;
revoke update (
  id,
  user_id,
  title,
  messages,
  created_at,
  updated_at,
  workspace_id,
  pinned,
  archived,
  label,
  color
) on public.ai_conversations from authenticated;
grant update (title, messages, updated_at, pinned, archived, label, color)
  on public.ai_conversations to authenticated;

drop policy if exists "Users can manage their own generated artifacts"
  on public.ai_generated_artifacts;

create policy "Workspace members can read generated artifacts"
  on public.ai_generated_artifacts for select
  to authenticated
  using (
    exists (
      select 1
      from public.ai_conversations
      where ai_conversations.id = ai_generated_artifacts.conversation_id
        and ai_conversations.workspace_id is not null
        and public.is_workspace_member(ai_conversations.workspace_id)
    )
  );

create policy "Workspace members can create generated artifacts"
  on public.ai_generated_artifacts for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.ai_conversations
      where ai_conversations.id = ai_generated_artifacts.conversation_id
        and ai_conversations.workspace_id is not null
        and public.is_workspace_member(ai_conversations.workspace_id)
    )
  );
