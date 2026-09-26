alter table public.deep_verify_videos
  add column if not exists store_id text;

alter table public.deep_verify_videos
  add constraint deep_verify_duration_limit
  check (duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 1800))
  not valid;

alter table public.deep_verify_videos
  validate constraint deep_verify_duration_limit;

update public.deep_verify_videos
set delete_after = null,
    updated_at = now()
where status in ('evidence_ready','provider_required','queued','analyzing')
  and delete_after is not null;

drop policy if exists "deep verify owner reads" on storage.objects;
drop policy if exists "deep verify owner deletes" on storage.objects;

create policy "deep verify owner reads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'deep-verify'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "deep verify owner deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'deep-verify'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.register_deep_verify_video(
  p_label text,
  p_store_id text,
  p_source_type text,
  p_storage_path text,
  p_external_url text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_seconds numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_game_id uuid;
  v_video_id uuid;
  v_source_type text := btrim(coalesce(p_source_type, ''));
  v_label text := btrim(coalesce(p_label, ''));
  v_store_id text := nullif(btrim(coalesce(p_store_id, '')), '');
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if char_length(v_label) < 1 or char_length(v_label) > 160 then
    raise exception 'Video label must be 1-160 characters';
  end if;
  if v_source_type not in ('upload','youtube_url') then raise exception 'Invalid Deep Verify source type'; end if;

  if v_source_type = 'upload' then
    if p_storage_path is null or btrim(p_storage_path) = '' then raise exception 'Uploaded evidence requires a storage path'; end if;
    if split_part(p_storage_path, '/', 1) <> v_owner::text then raise exception 'Storage path must be scoped to the authenticated owner'; end if;
    if p_external_url is not null and btrim(p_external_url) <> '' then raise exception 'Uploaded evidence cannot also have an external URL'; end if;
    if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 524288000 then raise exception 'Uploaded video must be between 1 byte and 500 MB'; end if;
    if p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > 1800 then raise exception 'Uploaded video must be 30 minutes or shorter'; end if;
    if p_mime_type not in ('video/mp4','video/quicktime','video/webm','video/x-m4v') then raise exception 'Unsupported video MIME type'; end if;
  else
    if p_external_url is null or btrim(p_external_url) = '' then raise exception 'YouTube evidence requires a public URL'; end if;
    if p_storage_path is not null and btrim(p_storage_path) <> '' then raise exception 'YouTube evidence cannot also have a storage path'; end if;
  end if;

  if v_store_id is not null then
    select sa.game_id into v_game_id
    from public.store_apps sa
    where sa.owner_id = v_owner and sa.store_id = v_store_id
    order by sa.created_at desc
    limit 1;
  end if;

  insert into public.deep_verify_videos(
    owner_id, game_id, store_id, label, source_type, storage_path, external_url,
    original_name, mime_type, size_bytes, duration_seconds, status, delete_after
  ) values (
    v_owner, v_game_id, v_store_id, v_label, v_source_type,
    case when v_source_type = 'upload' then btrim(p_storage_path) else null end,
    case when v_source_type = 'youtube_url' then btrim(p_external_url) else null end,
    nullif(btrim(coalesce(p_original_name, '')), ''),
    nullif(btrim(coalesce(p_mime_type, '')), ''),
    p_size_bytes,
    p_duration_seconds,
    'provider_required',
    null
  ) returning id into v_video_id;

  return v_video_id;
end;
$$;

create or replace function public.list_deep_verify_videos()
returns table (
  video_id uuid,
  label text,
  canonical_name text,
  store_id text,
  source_type text,
  status text,
  provider text,
  model text,
  original_name text,
  size_bytes bigint,
  duration_seconds numeric,
  delete_after timestamptz,
  created_at timestamptz,
  event_count bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    dv.id,
    dv.label,
    g.canonical_name,
    coalesce(dv.store_id, sa.store_id),
    dv.source_type,
    dv.status,
    dv.provider,
    dv.model,
    dv.original_name,
    dv.size_bytes,
    dv.duration_seconds,
    dv.delete_after,
    dv.created_at,
    (select count(*) from public.deep_verify_events de where de.video_id = dv.id and de.owner_id = auth.uid())
  from public.deep_verify_videos dv
  left join public.games g on g.id = dv.game_id and g.owner_id = auth.uid()
  left join lateral (
    select s.store_id
    from public.store_apps s
    where s.game_id = dv.game_id and s.owner_id = auth.uid()
    order by s.created_at asc
    limit 1
  ) sa on true
  where dv.owner_id = auth.uid()
  order by dv.created_at desc;
$$;

create or replace function public.load_deep_verify_video(p_video_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'videoId', dv.id,
    'label', dv.label,
    'canonicalName', g.canonical_name,
    'storeId', coalesce(dv.store_id, sa.store_id),
    'sourceType', dv.source_type,
    'storagePath', dv.storage_path,
    'externalUrl', dv.external_url,
    'originalName', dv.original_name,
    'mimeType', dv.mime_type,
    'sizeBytes', dv.size_bytes,
    'durationSeconds', dv.duration_seconds,
    'status', dv.status,
    'provider', dv.provider,
    'model', dv.model,
    'errorCode', dv.error_code,
    'errorMessage', dv.error_message,
    'deleteAfter', dv.delete_after,
    'createdAt', dv.created_at,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventId', de.id,
        'analysisRunId', de.analysis_run_id,
        'eventKey', de.event_key,
        'label', de.label,
        'claim', de.claim,
        'startSeconds', de.start_seconds,
        'endSeconds', de.end_seconds,
        'origin', de.origin,
        'interpretation', de.interpretation,
        'coverage', de.coverage,
        'reviewState', de.review_state,
        'confidence', de.confidence,
        'evidenceNote', de.evidence_note
      ) order by de.start_seconds, de.created_at)
      from public.deep_verify_events de
      where de.video_id = dv.id and de.owner_id = auth.uid()
    ), '[]'::jsonb)
  )
  from public.deep_verify_videos dv
  left join public.games g on g.id = dv.game_id and g.owner_id = auth.uid()
  left join lateral (
    select s.store_id
    from public.store_apps s
    where s.game_id = dv.game_id and s.owner_id = auth.uid()
    order by s.created_at asc
    limit 1
  ) sa on true
  where dv.id = p_video_id and dv.owner_id = auth.uid()
  limit 1;
$$;
