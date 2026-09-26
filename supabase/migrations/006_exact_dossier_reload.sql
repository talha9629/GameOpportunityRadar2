alter table public.analysis_runs
  add column if not exists source_observation_id uuid references public.observations(id) on delete set null;

create index if not exists idx_analysis_runs_source_observation_id
  on public.analysis_runs(source_observation_id);

create or replace function public.save_dossier(
  p_dossier jsonb,
  p_scorecard jsonb,
  p_decision jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_game_id uuid;
  v_observation_id uuid;
  v_run_id uuid;
  v_finding_id uuid;
  v_finding jsonb;
  v_platform public.radar_platform;
  v_store_id text;
  v_store_url text;
  v_now timestamptz := now();
begin
  if v_owner is null then
    raise exception 'Authentication required';
  end if;

  if p_dossier is null or p_dossier->'game' is null then
    raise exception 'Invalid dossier payload';
  end if;

  v_platform := (p_dossier->'game'->>'platform')::public.radar_platform;
  v_store_id := p_dossier->'game'->>'storeId';
  v_store_url := p_dossier->'game'->>'storeUrl';

  select sa.game_id
    into v_game_id
    from public.store_apps sa
   where sa.owner_id = v_owner
     and sa.platform = v_platform
     and sa.store_id = v_store_id
   limit 1;

  if v_game_id is null then
    insert into public.games (owner_id, canonical_name, publisher, updated_at)
    values (
      v_owner,
      p_dossier->'game'->>'canonicalName',
      nullif(p_dossier->'game'->>'publisher', ''),
      v_now
    )
    returning id into v_game_id;

    insert into public.store_apps (owner_id, game_id, platform, store_id, store_url)
    values (v_owner, v_game_id, v_platform, v_store_id, v_store_url);
  else
    update public.games
       set canonical_name = p_dossier->'game'->>'canonicalName',
           publisher = nullif(p_dossier->'game'->>'publisher', ''),
           updated_at = v_now
     where id = v_game_id
       and owner_id = v_owner;

    update public.store_apps
       set store_url = v_store_url
     where owner_id = v_owner
       and game_id = v_game_id
       and platform = v_platform
       and store_id = v_store_id;
  end if;

  insert into public.observations (
    owner_id, game_id, origin, source_name, source_url, raw_value, observed_at
  ) values (
    v_owner,
    v_game_id,
    'official_public',
    'Apple App Store dossier response',
    v_store_url,
    p_dossier,
    v_now
  )
  returning id into v_observation_id;

  insert into public.analysis_runs (
    owner_id, game_id, source_observation_id, run_type, provider, model, prompt_version,
    input_hash, status, estimated_cost_usd, started_at, completed_at
  ) values (
    v_owner,
    v_game_id,
    v_observation_id,
    'store_dossier',
    'apple_public_metadata',
    null,
    'm1-listing-v1',
    encode(digest(p_dossier::text, 'sha256'), 'hex'),
    'completed',
    0,
    v_now,
    v_now
  )
  returning id into v_run_id;

  for v_finding in select value from jsonb_array_elements(coalesce(p_dossier->'findings', '[]'::jsonb))
  loop
    insert into public.findings (
      owner_id, game_id, key, label, value, origin, interpretation,
      coverage, review_state, confidence, reviewed_at
    ) values (
      v_owner,
      v_game_id,
      v_finding->>'key',
      v_finding->>'label',
      to_jsonb(v_finding->>'value'),
      (v_finding->>'origin')::public.radar_origin,
      (v_finding->>'interpretation')::public.radar_interpretation,
      (v_finding->>'coverage')::public.radar_coverage,
      (v_finding->>'reviewState')::public.radar_review_state,
      coalesce((v_finding->>'confidence')::numeric, 0),
      case when (v_finding->>'reviewState') = 'unreviewed' then null else v_now end
    )
    returning id into v_finding_id;

    insert into public.finding_evidence (owner_id, finding_id, observation_id)
    values (v_owner, v_finding_id, v_observation_id);
  end loop;

  insert into public.scorecards (
    owner_id, game_id, analysis_run_id, momentum, solo_fit,
    differentiation_room, saturation, risk, confidence,
    hard_blocks, decision_status, decision_reasons
  ) values (
    v_owner,
    v_game_id,
    v_run_id,
    nullif(p_scorecard->>'momentum', '')::smallint,
    nullif(p_scorecard->>'soloFit', '')::smallint,
    nullif(p_scorecard->>'differentiation', '')::smallint,
    nullif(p_scorecard->>'saturation', '')::smallint,
    nullif(p_scorecard->>'risk', '')::smallint,
    nullif(p_scorecard->>'confidence', '')::smallint,
    coalesce(p_scorecard->'hardBlocks', '[]'::jsonb),
    p_decision->>'status',
    coalesce(p_decision->'reasons', '[]'::jsonb)
  );

  return v_run_id;
end;
$$;

revoke all on function public.save_dossier(jsonb, jsonb, jsonb) from public;
revoke all on function public.save_dossier(jsonb, jsonb, jsonb) from anon;
grant execute on function public.save_dossier(jsonb, jsonb, jsonb) to authenticated;

create or replace function public.list_saved_dossiers()
returns table (
  run_id uuid,
  game_id uuid,
  canonical_name text,
  publisher text,
  platform public.radar_platform,
  store_id text,
  decision_status text,
  reviewed_count bigint,
  finding_count bigint,
  saved_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  select
    ar.id as run_id,
    ar.game_id,
    g.canonical_name,
    g.publisher,
    sa.platform,
    sa.store_id,
    sc.decision_status,
    (
      select count(*)
      from jsonb_array_elements(coalesce(o.raw_value->'findings', '[]'::jsonb)) f
      where coalesce(f->>'reviewState', 'unreviewed') <> 'unreviewed'
    ) as reviewed_count,
    jsonb_array_length(coalesce(o.raw_value->'findings', '[]'::jsonb))::bigint as finding_count,
    ar.completed_at as saved_at
  from public.analysis_runs ar
  join public.games g on g.id = ar.game_id and g.owner_id = auth.uid()
  join public.observations o on o.id = ar.source_observation_id and o.owner_id = auth.uid()
  join public.scorecards sc on sc.analysis_run_id = ar.id and sc.owner_id = auth.uid()
  left join lateral (
    select s.platform, s.store_id
    from public.store_apps s
    where s.game_id = ar.game_id and s.owner_id = auth.uid()
    order by s.created_at asc
    limit 1
  ) sa on true
  where ar.owner_id = auth.uid()
    and ar.run_type = 'store_dossier'
    and ar.status = 'completed'
  order by ar.completed_at desc nulls last, ar.started_at desc;
$$;

create or replace function public.load_saved_dossier(p_run_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'runId', ar.id,
    'savedAt', ar.completed_at,
    'dossier', o.raw_value,
    'scorecard', jsonb_build_object(
      'momentum', sc.momentum,
      'soloFit', sc.solo_fit,
      'differentiation', sc.differentiation_room,
      'saturation', sc.saturation,
      'risk', sc.risk,
      'confidence', sc.confidence,
      'hardBlocks', sc.hard_blocks
    ),
    'decision', jsonb_build_object(
      'status', sc.decision_status,
      'reasons', sc.decision_reasons
    )
  )
  from public.analysis_runs ar
  join public.observations o on o.id = ar.source_observation_id and o.owner_id = auth.uid()
  join public.scorecards sc on sc.analysis_run_id = ar.id and sc.owner_id = auth.uid()
  where ar.id = p_run_id
    and ar.owner_id = auth.uid()
    and ar.run_type = 'store_dossier'
    and ar.status = 'completed'
  limit 1;
$$;

revoke all on function public.list_saved_dossiers() from public;
revoke all on function public.list_saved_dossiers() from anon;
grant execute on function public.list_saved_dossiers() to authenticated;

revoke all on function public.load_saved_dossier(uuid) from public;
revoke all on function public.load_saved_dossier(uuid) from anon;
grant execute on function public.load_saved_dossier(uuid) to authenticated;
