create index if not exists idx_store_apps_game_id on public.store_apps(game_id);
create index if not exists idx_observations_game_id on public.observations(game_id);
create index if not exists idx_findings_game_id on public.findings(game_id);
create index if not exists idx_finding_evidence_observation_id on public.finding_evidence(observation_id);
create index if not exists idx_analysis_runs_game_id on public.analysis_runs(game_id);
