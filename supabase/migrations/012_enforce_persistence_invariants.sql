alter table public.analysis_runs
  add constraint analysis_runs_store_dossier_integrity
  check (
    run_type <> 'store_dossier'
    or (
      source_observation_id is not null
      and dossier_snapshot is not null
      and jsonb_typeof(dossier_snapshot) = 'object'
      and jsonb_typeof(dossier_snapshot->'game') = 'object'
      and jsonb_typeof(dossier_snapshot->'findings') = 'array'
      and jsonb_typeof(dossier_snapshot->'unknowns') = 'array'
    )
  ) not valid;

alter table public.analysis_runs
  validate constraint analysis_runs_store_dossier_integrity;

alter table public.competitor_relations
  add constraint competitor_relations_evidence_integrity
  check (
    primary_observation_id is not null
    and competitor_observation_id is not null
    and jsonb_typeof(primary_analysis) = 'object'
    and jsonb_typeof(competitor_analysis) = 'object'
    and jsonb_typeof(differentiation) = 'object'
  ) not valid;

alter table public.competitor_relations
  validate constraint competitor_relations_evidence_integrity;
