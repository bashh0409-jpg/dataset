create or replace function public.can_upload_bug_report_attachment(
  p_user_id uuid,
  p_object_name text,
  p_object_size text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, storage, auth
as $$
declare
  v_max_object_size constant bigint := 10485760;
  v_object_size bigint;
  v_recent_count integer;
  v_recent_bytes bigint;
begin
  if p_user_id is null
    or p_user_id <> (select auth.uid())
    or p_object_name is null
  then
    return false;
  end if;

  if p_object_size ~ '^[0-9]{1,8}$'
    and p_object_size::bigint between 1 and v_max_object_size
  then
    v_object_size := p_object_size::bigint;
  else
    v_object_size := v_max_object_size;
  end if;

  if cardinality(storage.foldername(p_object_name)) <> 1
    or (storage.foldername(p_object_name))[1] <> p_user_id::text
    or storage.filename(p_object_name) !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|webm|ogg|mp4|mpeg|wav)$'
  then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('bug-attachment:' || p_user_id::text, 0)
  );

  select
    count(*)::integer,
    coalesce(
      sum(
        case
          when metadata ->> 'size' ~ '^[0-9]{1,8}$'
            and (metadata ->> 'size')::bigint between 1 and v_max_object_size
            then (metadata ->> 'size')::bigint
          else v_max_object_size
        end
      ),
      0
    )::bigint
    into v_recent_count, v_recent_bytes
    from storage.objects
    where bucket_id = 'bug-report-attachments'
      and (storage.foldername(name))[1] = p_user_id::text
      and created_at > now() - interval '24 hours';

  return v_recent_count < 30
    and v_recent_bytes + v_object_size <= 104857600;
end;
$$;
