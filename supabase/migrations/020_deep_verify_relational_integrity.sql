create index if not exists deep_verify_events_video_id_idx
  on public.deep_verify_events(video_id);

drop policy if exists "owner manages deep verify videos" on public.deep_verify_videos;
create policy "owner manages deep verify videos"
on public.deep_verify_videos
for all
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (
    game_id is null
    or exists (
      select 1
      from public.games g
      where g.id = game_id
        and g.owner_id = (select auth.uid())
    )
  )
);

drop policy if exists "owner manages deep verify events" on public.deep_verify_events;
create policy "owner manages deep verify events"
on public.deep_verify_events
for all
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.deep_verify_videos dv
    where dv.id = video_id
      and dv.owner_id = (select auth.uid())
  )
  and (
    analysis_run_id is null
    or exists (
      select 1
      from public.analysis_runs ar
      where ar.id = analysis_run_id
        and ar.owner_id = (select auth.uid())
        and ar.video_id = video_id
    )
  )
);

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
