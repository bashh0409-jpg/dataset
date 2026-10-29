create or replace function public.enforce_bug_report_submission_limits()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_path text;
  v_attachment_size text;
  v_image_count integer := 0;
  v_user_id uuid := (select auth.uid());
  v_recent_reports integer;
begin
  if v_user_id is null or new.user_id <> v_user_id then
    raise exception using
      errcode = '42501',
      message = 'Authentication required to submit a bug report.';
  end if;

  foreach v_path in array new.attachment_paths loop
    if v_path !~ (
      '^' || v_user_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|webm|ogg|mp4|mpeg|wav)$'
    ) then
      raise exception using
        errcode = '22023',
        message = 'A bug report attachment path is invalid.';
    end if;

    if v_path ~* '\.(jpg|png|webp|gif)$' then
      v_image_count := v_image_count + 1;
      select metadata ->> 'size'
        into v_attachment_size
        from storage.objects
        where bucket_id = 'bug-report-attachments'
          and name = v_path;

      if v_attachment_size is null
        or v_attachment_size !~ '^[0-9]{1,8}$'
        or v_attachment_size::bigint < 1
        or v_attachment_size::bigint > 3145728
      then
        raise exception using
          errcode = '22023',
          message = 'Bug report images must not exceed 3 MiB.';
      end if;
    end if;
  end loop;

  if v_image_count > 5 then
    raise exception using
      errcode = '22023',
      message = 'A bug report may include at most five images.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('bug-report:' || v_user_id::text, 0)
  );

  select count(*)::integer
    into v_recent_reports
    from public.bug_reports
    where user_id = v_user_id
      and created_at > now() - interval '1 hour';

  if v_recent_reports >= 5 then
    raise exception using
      errcode = 'P0001',
      message = 'Bug report submission limit reached.';
  end if;

  return new;
end;
$$;

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
  v_max_object_size bigint;
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

  if storage.filename(p_object_name) ~* '\.(jpg|png|webp|gif)$' then
    v_max_object_size := 3145728;
  else
    v_max_object_size := 10485760;
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

  if p_object_size ~ '^[0-9]{1,8}$'
    and p_object_size::bigint > v_max_object_size
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
            and (metadata ->> 'size')::bigint between 1 and
              case
                when storage.filename(name) ~* '\.(jpg|png|webp|gif)$'
                  then 3145728
                else 10485760
              end
            then (metadata ->> 'size')::bigint
          when storage.filename(name) ~* '\.(jpg|png|webp|gif)$'
            then 3145728
          else 10485760
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
