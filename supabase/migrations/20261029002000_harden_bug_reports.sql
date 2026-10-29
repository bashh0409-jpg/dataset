create or replace function public.enforce_bug_report_submission_limits()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_path text;
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
  end loop;

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

revoke all on function public.enforce_bug_report_submission_limits()
  from public, anon, authenticated;

create trigger enforce_bug_report_submission_limits
  before insert on public.bug_reports
  for each row
  execute function public.enforce_bug_report_submission_limits();

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
  v_object_size bigint;
  v_recent_count integer;
  v_recent_bytes bigint;
begin
  if p_user_id is null
    or p_user_id <> (select auth.uid())
    or p_object_name is null
    or p_object_size is null
    or p_object_size !~ '^[0-9]{1,8}$'
  then
    return false;
  end if;

  v_object_size := p_object_size::bigint;
  if v_object_size < 1 or v_object_size > 10485760 then
    return false;
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
          when metadata ->> 'size' ~ '^[0-9]{1,10}$'
            then (metadata ->> 'size')::bigint
          else 0
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

revoke all on function public.can_upload_bug_report_attachment(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.can_upload_bug_report_attachment(uuid, text, text)
  to authenticated;

drop policy if exists "Users can upload their own bug report attachments"
  on storage.objects;

create policy "Users can upload limited bug report attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bug-report-attachments'
    and public.can_upload_bug_report_attachment(
      (select auth.uid()),
      name,
      metadata ->> 'size'
    )
  );
