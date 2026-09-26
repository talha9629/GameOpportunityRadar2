create table public.scorecards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  game_id uuid not null references public.games(id) on delete cascade,
  analysis_run_id uuid references public.analysis_runs(id) on delete set null,
  momentum smallint check (momentum between 1 and 5),
  solo_fit smallint check (solo_fit between 1 and 5),
  differentiation_room smallint check (differentiation_room between 1 and 5),
  saturation smallint check (saturation between 1 and 5),
  risk smallint check (risk between 1 and 5),
  confidence smallint check (confidence between 1 and 5),
  hard_blocks jsonb not null default '[]'::jsonb,
  decision_status text not null,
  decision_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.scorecards enable row level security;

create policy "owner manages scorecards" on public.scorecards for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.scorecards to authenticated;

create index scorecards_game_id_idx on public.scorecards(game_id);
create index scorecards_analysis_run_id_idx on public.scorecards(analysis_run_id);
create index scorecards_owner_created_at_idx on public.scorecards(owner_id, created_at desc);
