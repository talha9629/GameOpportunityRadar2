insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deep-verify',
  'deep-verify',
  false,
  524288000,
  array['video/mp4','video/quicktime','video/webm','video/x-m4v']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "deep verify owner uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'deep-verify'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "deep verify owner reads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'deep-verify'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "deep verify owner deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'deep-verify'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create table public.deep_verify_videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  game_id uuid references public.games(id) on delete set null,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  source_type text not null check (source_type in ('upload','youtube_url')),
  storage_path text,
  external_url text,
  original_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or (size_bytes >= 0 and size_bytes <= 524288000)),
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'evidence_ready' check (status in (
    'evidence_ready','provider_required','queued','analyzing','completed','failed'
  )),
  provider text,
  model text,
  error_code text,
  error_message text,
  delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type = 'upload' and storage_path is not null and external_url is null)
    or (source_type = 'youtube_url' and external_url is not null and storage_path is null)
  )
);

create index deep_verify_videos_owner_created_idx on public.deep_verify_videos(owner_id, created_at desc);
create index deep_verify_videos_game_idx on public.deep_verify_videos(game_id);

alter table public.analysis_runs
  add column if not exists video_id uuid references public.deep_verify_videos(id) on delete set null;

create index if not exists analysis_runs_video_id_idx on public.analysis_runs(video_id);

create table public.deep_verify_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  video_id uuid not null references public.deep_verify_videos(id) on delete cascade,
  analysis_run_id uuid references public.analysis_runs(id) on delete cascade,
  event_key text not null,
  label text not null,
  claim text not null check (char_length(btrim(claim)) between 1 and 4000),
  start_seconds numeric not null check (start_seconds >= 0),
  end_seconds numeric check (end_seconds is null or end_seconds >= start_seconds),
  origin public.radar_origin not null,
  interpretation public.radar_interpretation not null default 'ai_inferred',
  coverage public.radar_coverage not null default 'inferred',
  review_state public.radar_review_state not null default 'unreviewed',
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  evidence_note text,
  created_at timestamptz not null default now()
);

create index deep_verify_events_owner_video_idx on public.deep_verify_events(owner_id, video_id, start_seconds);
create index deep_verify_events_run_idx on public.deep_verify_events(analysis_run_id);

alter table public.deep_verify_videos enable row level security;
alter table public.deep_verify_events enable row level security;

create policy "owner manages deep verify videos"
on public.deep_verify_videos for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "owner manages deep verify events"
on public.deep_verify_events for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.deep_verify_videos to authenticated;
grant select, insert, update, delete on public.deep_verify_events to authenticated;

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
    if p_mime_type not in ('video/mp4','video/quicktime','video/webm','video/x-m4v') then raise exception 'Unsupported video MIME type'; end if;
  else
    if p_external_url is null or btrim(p_external_url) = '' then raise exception 'YouTube evidence requires a public URL'; end if;
    if p_storage_path is not null and btrim(p_storage_path) <> '' then raise exception 'YouTube evidence cannot also have a storage path'; end if;
  end if;

  if nullif(btrim(coalesce(p_store_id, '')), '') is not null then
    select sa.game_id into v_game_id
    from public.store_apps sa
    where sa.owner_id = v_owner and sa.store_id = btrim(p_store_id)
    order by sa.created_at desc
    limit 1;
  end if;

  insert into public.deep_verify_videos(
    owner_id, game_id, label, source_type, storage_path, external_url,
    original_name, mime_type, size_bytes, duration_seconds, status, delete_after
  ) values (
    v_owner, v_game_id, v_label, v_source_type,
    case when v_source_type = 'upload' then btrim(p_storage_path) else null end,
    case when v_source_type = 'youtube_url' then btrim(p_external_url) else null end,
    nullif(btrim(coalesce(p_original_name, '')), ''),
    nullif(btrim(coalesce(p_mime_type, '')), ''),
    p_size_bytes,
    p_duration_seconds,
    'evidence_ready',
    case when v_source_type = 'upload' then now() + interval '24 hours' else null end
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
    sa.store_id,
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
    'storeId', sa.store_id,
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

revoke all on function public.register_deep_verify_video(text,text,text,text,text,text,text,bigint,numeric) from PUBLIC;
revoke all on function public.register_deep_verify_video(text,text,text,text,text,text,text,bigint,numeric) from anon;
grant execute on function public.register_deep_verify_video(text,text,text,text,text,text,text,bigint,numeric) to authenticated;

revoke all on function public.list_deep_verify_videos() from PUBLIC;
revoke all on function public.list_deep_verify_videos() from anon;
grant execute on function public.list_deep_verify_videos() to authenticated;

revoke all on function public.load_deep_verify_video(uuid) from PUBLIC;
revoke all on function public.load_deep_verify_video(uuid) from anon;
grant execute on function public.load_deep_verify_video(uuid) to authenticated;
