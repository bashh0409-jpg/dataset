alter table public.bug_reports
  drop constraint if exists bug_reports_description_check;

alter table public.bug_reports
  add constraint bug_reports_description_check
  check (char_length(trim(description)) between 10 and 10000);

do $$
begin
  if exists (
    select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bug_reports'
        and column_name = 'expected_behavior'
  ) then
    alter table public.bug_reports
      alter column expected_behavior drop not null;
  end if;

  if exists (
    select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bug_reports'
        and column_name = 'steps_to_reproduce'
  ) then
    alter table public.bug_reports
      alter column steps_to_reproduce drop not null;
  end if;
end
$$;

alter table public.bug_reports
  add column if not exists attachment_paths text[] not null default '{}';

alter table public.bug_reports
  drop constraint if exists bug_reports_attachment_urls_check;

alter table public.bug_reports
  drop constraint if exists bug_reports_attachment_paths_check;

alter table public.bug_reports
  add constraint bug_reports_attachment_paths_check
  check (
    cardinality(attachment_paths) <= 6
    and char_length(array_to_string(attachment_paths, '')) <= 768
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'bug-report-attachments',
  'bug-report-attachments',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can upload their own bug report attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bug-report-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can read their own bug report attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'bug-report-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete their own bug report attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'bug-report-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
