create extension if not exists pgcrypto;

create type public.radar_platform as enum ('ios','android');
create type public.radar_origin as enum ('official_public','third_party_public','third_party_estimate','publisher_report','user_capture','human_input');
create type public.radar_interpretation as enum ('direct','ai_inferred','human_inferred');
create type public.radar_coverage as enum ('verified','partial','inferred','unknown');
create type public.radar_review_state as enum ('unreviewed','human_confirmed','human_rejected','needs_more_evidence');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  canonical_name text not null,
  publisher text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  game_id uuid not null references public.games(id) on delete cascade,
  platform public.radar_platform not null,
  store_id text not null,
  store_url text not null,
  created_at timestamptz not null default now(),
  unique(owner_id, platform, store_id)
);

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  game_id uuid not null references public.games(id) on delete cascade,
  origin public.radar_origin not null,
  source_name text not null,
  source_url text,
  raw_value jsonb not null,
  observed_at timestamptz not null default now()
);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  game_id uuid not null references public.games(id) on delete cascade,
  key text not null,
  label text not null,
  value jsonb not null,
  origin public.radar_origin not null,
  interpretation public.radar_interpretation not null,
  coverage public.radar_coverage not null,
  review_state public.radar_review_state not null default 'unreviewed',
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.finding_evidence (
  owner_id uuid not null default auth.uid(),
  finding_id uuid not null references public.findings(id) on delete cascade,
  observation_id uuid not null references public.observations(id) on delete cascade,
  primary key (finding_id, observation_id)
);

create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  game_id uuid references public.games(id) on delete cascade,
  run_type text not null,
  provider text not null,
  model text,
  prompt_version text,
  input_hash text,
  status text not null,
  estimated_cost_usd numeric not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.games enable row level security;
alter table public.store_apps enable row level security;
alter table public.observations enable row level security;
alter table public.findings enable row level security;
alter table public.finding_evidence enable row level security;
alter table public.analysis_runs enable row level security;

create policy "owner manages games" on public.games for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages store apps" on public.store_apps for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages observations" on public.observations for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages findings" on public.findings for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages finding evidence" on public.finding_evidence for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages analysis runs" on public.analysis_runs for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.games to authenticated;
grant select, insert, update, delete on public.store_apps to authenticated;
grant select, insert, update, delete on public.observations to authenticated;
grant select, insert, update, delete on public.findings to authenticated;
grant select, insert, update, delete on public.finding_evidence to authenticated;
grant select, insert, update, delete on public.analysis_runs to authenticated;
