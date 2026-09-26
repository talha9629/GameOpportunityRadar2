alter table public.deep_verify_videos
  add column if not exists source_deleted_at timestamptz;

alter table public.deep_verify_videos
  add constraint deep_verify_source_deleted_only_upload
  check (source_deleted_at is null or source_type = 'upload')
  not valid;

alter table public.deep_verify_videos
  validate constraint deep_verify_source_deleted_only_upload;

alter table public.deep_verify_videos
  add constraint deep_verify_delete_after_completed_upload
  check (delete_after is null or (source_type = 'upload' and status = 'completed'))
  not valid;

alter table public.deep_verify_videos
  validate constraint deep_verify_delete_after_completed_upload;

drop function public.list_deep_verify_videos();

create function public.list_deep_verify_videos()
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
  source_deleted_at timestamptz,
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
    dv.source_deleted_at,
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

revoke all on function public.list_deep_verify_videos() from PUBLIC;
revoke all on function public.list_deep_verify_videos() from anon;
grant execute on function public.list_deep_verify_videos() to authenticated;

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
    'sourceDeletedAt', dv.source_deleted_at,
    'createdAt', dv.created_at,
    'latestAnalysis', (
      select jsonb_build_object(
        'runId', ar.id,
        'status', ar.status,
        'provider', ar.provider,
        'model', ar.model,
        'estimatedCostUsd', ar.estimated_cost_usd,
        'startedAt', ar.started_at,
        'completedAt', ar.completed_at,
        'summary', ar.dossier_snapshot->>'summary',
        'unknowns', coalesce(ar.dossier_snapshot->'unknowns', '[]'::jsonb),
        'usage', ar.dossier_snapshot->'usage'
      )
      from public.analysis_runs ar
      where ar.video_id = dv.id
        and ar.owner_id = auth.uid()
        and ar.run_type = 'deep_verify_video'
      order by ar.started_at desc
      limit 1
    ),
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
        'reviewedAt', de.reviewed_at,
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

create or replace function public.mark_deep_verify_source_deleted(p_video_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.deep_verify_videos
  set source_deleted_at = now(),
      delete_after = null,
      updated_at = now()
  where id = p_video_id
    and owner_id = auth.uid()
    and source_type = 'upload';

  if not found then
    raise exception 'Deep Verify upload not found or not accessible';
  end if;
end;
$$;

revoke all on function public.mark_deep_verify_source_deleted(uuid) from PUBLIC;
revoke all on function public.mark_deep_verify_source_deleted(uuid) from anon;
grant execute on function public.mark_deep_verify_source_deleted(uuid) to authenticated;
