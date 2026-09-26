create or replace function public.radar_integrity_report()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with
  bad_dossier_runs as (
    select count(*)::int as n
    from public.analysis_runs ar
    where ar.run_type = 'store_dossier'
      and (
        ar.source_observation_id is null
        or ar.dossier_snapshot is null
        or jsonb_typeof(ar.dossier_snapshot) <> 'object'
        or jsonb_typeof(ar.dossier_snapshot->'game') <> 'object'
        or jsonb_typeof(ar.dossier_snapshot->'findings') <> 'array'
        or jsonb_typeof(ar.dossier_snapshot->'unknowns') <> 'array'
      )
  ),
  bad_competitor_relations as (
    select count(*)::int as n
    from public.competitor_relations cr
    where cr.primary_observation_id is null
       or cr.competitor_observation_id is null
       or jsonb_typeof(cr.primary_analysis) <> 'object'
       or jsonb_typeof(cr.competitor_analysis) <> 'object'
       or jsonb_typeof(cr.differentiation) <> 'object'
  ),
  orphan_scorecards as (
    select count(*)::int as n
    from public.scorecards sc
    left join public.analysis_runs ar on ar.id = sc.analysis_run_id
    where sc.analysis_run_id is not null and ar.id is null
  ),
  saved_runs as (
    select count(*)::int as n
    from public.analysis_runs ar
    join public.scorecards sc on sc.analysis_run_id = ar.id
    where ar.run_type = 'store_dossier'
      and ar.status = 'completed'
      and ar.source_observation_id is not null
      and ar.dossier_snapshot is not null
  )
  select jsonb_build_object(
    'ok', (select n from bad_dossier_runs) = 0
          and (select n from bad_competitor_relations) = 0
          and (select n from orphan_scorecards) = 0,
    'badDossierRuns', (select n from bad_dossier_runs),
    'badCompetitorRelations', (select n from bad_competitor_relations),
    'orphanScorecards', (select n from orphan_scorecards),
    'savedDossierRuns', (select n from saved_runs)
  );
$$;

revoke all on function public.radar_integrity_report() from public;
grant execute on function public.radar_integrity_report() to anon, authenticated;
