alter table public.ai_generated_artifacts
  add column canvas_position jsonb,
  add constraint ai_generated_artifacts_canvas_position_valid
    check (
      case
        when canvas_position is null then true
        when (
          jsonb_typeof(canvas_position) = 'object'
          and jsonb_typeof(canvas_position -> 'x') = 'number'
          and jsonb_typeof(canvas_position -> 'y') = 'number'
        ) then
          (canvas_position ->> 'x')::numeric between -1000000 and 1000000
          and (canvas_position ->> 'y')::numeric between -1000000 and 1000000
        else false
      end
    );

drop policy if exists "Workspace members can update generated artifact canvas positions"
  on public.ai_generated_artifacts;
create policy "Workspace members can update generated artifact canvas positions"
  on public.ai_generated_artifacts for update
  to authenticated
  using (
    exists (
      select 1
      from public.ai_conversations
      where ai_conversations.id = ai_generated_artifacts.conversation_id
        and ai_conversations.workspace_id is not null
        and public.is_workspace_member(ai_conversations.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.ai_conversations
      where ai_conversations.id = ai_generated_artifacts.conversation_id
        and ai_conversations.workspace_id is not null
        and public.is_workspace_member(ai_conversations.workspace_id)
    )
  );

revoke update on public.ai_generated_artifacts from authenticated;
grant update (canvas_position)
  on public.ai_generated_artifacts to authenticated;
