create or replace function public.edit_ai_conversation_after_message(
  p_conversation_id uuid,
  p_workspace_id uuid,
  p_messages jsonb,
  p_title text,
  p_artifact_ids uuid[]
)
returns table (
  id uuid,
  workspace_id uuid,
  title text,
  updated_at timestamptz,
  pinned boolean,
  archived boolean,
  label text,
  color text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_artifact_ids uuid[] := coalesce(p_artifact_ids, array[]::uuid[]);
  v_artifact_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace membership is required.';
  end if;

  if p_messages is null
    or jsonb_typeof(p_messages) <> 'array'
    or jsonb_array_length(p_messages) < 1
    or jsonb_array_length(p_messages) > 100
    or p_title is null
    or char_length(trim(p_title)) < 1
    or char_length(p_title) > 120
    or cardinality(v_artifact_ids) > 1000
    or cardinality(v_artifact_ids) <> (
      select count(distinct ids.artifact_id)
        from unnest(v_artifact_ids) as ids(artifact_id)
    )
    or exists (
      select 1
        from jsonb_array_elements(p_messages) as messages(value)
        where jsonb_typeof(messages.value) <> 'object'
          or coalesce(messages.value ->> 'role', '') not in ('user', 'assistant')
          or char_length(trim(coalesce(messages.value ->> 'content', '')))
            not between 1 and 4000
    )
  then
    raise exception 'Conversation edit input is invalid.';
  end if;

  if not exists (
    select 1
      from jsonb_array_elements(p_messages) as messages(value)
      where messages.value ->> 'role' = 'user'
    ) then
    raise exception 'A chat needs a user message before it can be saved.';
  end if;

  perform 1
    from public.ai_conversations as conversation
    where conversation.id = p_conversation_id
      and conversation.workspace_id = p_workspace_id
    for update;

  if not found then
    raise exception 'Saved chat not found.';
  end if;

  if cardinality(v_artifact_ids) > 0 then
    select count(*)
      into v_artifact_count
      from public.ai_generated_artifacts as artifact
      where artifact.conversation_id = p_conversation_id
        and artifact.id = any(v_artifact_ids);

    if v_artifact_count <> cardinality(v_artifact_ids) then
      raise exception 'Generated data does not belong to this saved chat.';
    end if;

    delete from public.ai_generated_artifacts as artifact
      where artifact.conversation_id = p_conversation_id
        and artifact.id = any(v_artifact_ids);
  end if;

  return query
    update public.ai_conversations as conversation
      set messages = p_messages,
          title = p_title,
          updated_at = now()
      where conversation.id = p_conversation_id
        and conversation.workspace_id = p_workspace_id
      returning conversation.id,
                conversation.workspace_id,
                conversation.title,
                conversation.updated_at,
                conversation.pinned,
                conversation.archived,
                conversation.label,
                conversation.color;
end;
$$;

revoke all on function public.edit_ai_conversation_after_message(
  uuid, uuid, jsonb, text, uuid[]
) from public, anon;
grant execute on function public.edit_ai_conversation_after_message(
  uuid, uuid, jsonb, text, uuid[]
) to authenticated;
