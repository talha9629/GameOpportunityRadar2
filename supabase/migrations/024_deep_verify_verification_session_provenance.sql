alter table public.deep_verify_videos
  add column if not exists verification_session_id text,
  add column if not exists verification_task_ids text[] not null default '{}'::text[],
  add column if not exists verification_unknowns text[] not null default '{}'::text[],
  add column if not exists verification_categories text[] not null default '{}'::text[],
  add column if not exists verification_research_generated_at timestamptz;

alter table public.deep_verify_videos
  add constraint deep_verify_verification_session_id_format
  check (
    verification_session_id is null
    or verification_session_id ~ '^[a-f0-9]{24}$'
  )
  not valid;

alter table public.deep_verify_videos
  validate constraint deep_verify_verification_session_id_format;

alter table public.deep_verify_videos
  add constraint deep_verify_verification_session_cardinality
  check (
    cardinality(verification_task_ids) <= 8
    and cardinality(verification_task_ids) = cardinality(verification_unknowns)
    and cardinality(verification_task_ids) = cardinality(verification_categories)
    and (
      (
        verification_session_id is null
        and cardinality(verification_task_ids) = 0
        and verification_research_generated_at is null
      )
      or (
        verification_session_id is not null
        and cardinality(verification_task_ids) between 1 and 8
        and verification_research_generated_at is not null
      )
    )
  )
  not valid;

alter table public.deep_verify_videos
  validate constraint deep_verify_verification_session_cardinality;

create index if not exists deep_verify_videos_owner_verification_session_idx
  on public.deep_verify_videos(owner_id, verification_session_id)
  where verification_session_id is not null;

create or replace function public.register_deep_verify_video_with_session(
  p_label text,
  p_store_id text,
  p_source_type text,
  p_storage_path text,
  p_external_url text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_seconds numeric,
  p_verification_session_id text,
  p_verification_task_ids text[],
  p_verification_unknowns text[],
  p_verification_categories text[],
  p_verification_research_generated_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_video_id uuid;
  v_session_id text := btrim(coalesce(p_verification_session_id, ''));
  v_task_ids text[] := coalesce(p_verification_task_ids, '{}'::text[]);
  v_unknowns text[] := coalesce(p_verification_unknowns, '{}'::text[]);
  v_categories text[] := coalesce(p_verification_categories, '{}'::text[]);
  v_task_id text;
  v_unknown text;
  v_category text;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if v_session_id !~ '^[a-f0-9]{24}$' then raise exception 'Invalid verification session ID'; end if;
  if cardinality(v_task_ids) < 1 or cardinality(v_task_ids) > 8 then
    raise exception 'Verification session must contain 1-8 task IDs';
  end if;
  if cardinality(v_task_ids) <> cardinality(v_unknowns)
     or cardinality(v_task_ids) <> cardinality(v_categories) then
    raise exception 'Verification session task, unknown, and category counts must match';
  end if;
  if p_verification_research_generated_at is null then
    raise exception 'Verification session research timestamp is required';
  end if;

  foreach v_task_id in array v_task_ids loop
    if v_task_id !~ '^[a-f0-9]{24}$' then raise exception 'Invalid verification task ID'; end if;
  end loop;

  foreach v_unknown in array v_unknowns loop
    if char_length(btrim(coalesce(v_unknown, ''))) < 15 or char_length(v_unknown) > 2000 then
      raise exception 'Verification unknown must be 15-2000 characters';
    end if;
  end loop;

  foreach v_category in array v_categories loop
    if v_category not in ('gameplay_mechanic','monetization_placement','meta_progression','other_unknown') then
      raise exception 'Invalid verification category';
    end if;
  end loop;

  v_video_id := public.register_deep_verify_video(
    p_label,
    p_store_id,
    p_source_type,
    p_storage_path,
    p_external_url,
    p_original_name,
    p_mime_type,
    p_size_bytes,
    p_duration_seconds
  );

  update public.deep_verify_videos
  set verification_session_id = v_session_id,
      verification_task_ids = v_task_ids,
      verification_unknowns = v_unknowns,
      verification_categories = v_categories,
      verification_research_generated_at = p_verification_research_generated_at,
      updated_at = now()
  where id = v_video_id
    and owner_id = v_owner;

  if not found then
    raise exception 'Deep Verify evidence registration was not owner-accessible';
  end if;

  return v_video_id;
end;
$$;

revoke all on function public.register_deep_verify_video_with_session(
  text,text,text,text,text,text,text,bigint,numeric,text,text[],text[],text[],timestamptz
) from PUBLIC;
revoke all on function public.register_deep_verify_video_with_session(
  text,text,text,text,text,text,text,bigint,numeric,text,text[],text[],text[],timestamptz
) from anon;
grant execute on function public.register_deep_verify_video_with_session(
  text,text,text,text,text,text,text,bigint,numeric,text,text[],text[],text[],timestamptz
) to authenticated;

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
    'verificationSession', case
      when dv.verification_session_id is null then null
      else jsonb_build_object(
        'sessionId', dv.verification_session_id,
        'taskIds', to_jsonb(dv.verification_task_ids),
        'unknowns', to_jsonb(dv.verification_unknowns),
        'categories', to_jsonb(dv.verification_categories),
        'researchGeneratedAt', dv.verification_research_generated_at
      )
    end,
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

revoke all on function public.load_deep_verify_video(uuid) from PUBLIC;
revoke all on function public.load_deep_verify_video(uuid) from anon;
grant execute on function public.load_deep_verify_video(uuid) to authenticated;
