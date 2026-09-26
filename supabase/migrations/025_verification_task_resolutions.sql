create table if not exists public.verification_task_resolutions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  task_id text not null,
  session_id text not null,
  source_video_id uuid not null references public.deep_verify_videos(id) on delete restrict,
  source_event_id uuid references public.deep_verify_events(id) on delete restrict,
  unknown_snapshot text not null,
  category text not null,
  research_generated_at timestamptz not null,
  resolution_state text not null,
  resolution_summary text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_task_resolution_task_id_format check (task_id ~ '^[a-f0-9]{24}$'),
  constraint verification_task_resolution_session_id_format check (session_id ~ '^[a-f0-9]{24}$'),
  constraint verification_task_resolution_category check (category in ('gameplay_mechanic','monetization_placement','meta_progression','other_unknown')),
  constraint verification_task_resolution_state check (resolution_state in ('resolved','needs_more_evidence')),
  constraint verification_task_resolution_unknown_length check (char_length(btrim(unknown_snapshot)) between 15 and 2000),
  constraint verification_task_resolution_summary_length check (char_length(btrim(resolution_summary)) between 10 and 4000),
  constraint verification_task_resolution_resolved_shape check (
    (resolution_state = 'resolved' and source_event_id is not null and resolved_at is not null)
    or
    (resolution_state = 'needs_more_evidence' and source_event_id is null and resolved_at is null)
  ),
  unique(owner_id, task_id)
);

alter table public.verification_task_resolutions enable row level security;

revoke all on table public.verification_task_resolutions from anon, authenticated;
grant select, insert, update, delete on table public.verification_task_resolutions to authenticated;

create policy "owner reads verification task resolutions"
on public.verification_task_resolutions
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "owner inserts valid verification task resolutions"
on public.verification_task_resolutions
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.deep_verify_videos dv
    cross join lateral generate_subscripts(dv.verification_task_ids, 1) as s(i)
    where dv.id = verification_task_resolutions.source_video_id
      and dv.owner_id = (select auth.uid())
      and dv.verification_session_id = verification_task_resolutions.session_id
      and dv.verification_research_generated_at = verification_task_resolutions.research_generated_at
      and dv.verification_task_ids[s.i] = verification_task_resolutions.task_id
      and dv.verification_unknowns[s.i] = verification_task_resolutions.unknown_snapshot
      and dv.verification_categories[s.i] = verification_task_resolutions.category
  )
  and (
    (
      resolution_state = 'needs_more_evidence'
      and source_event_id is null
    )
    or
    (
      resolution_state = 'resolved'
      and exists (
        select 1
        from public.deep_verify_events de
        where de.id = verification_task_resolutions.source_event_id
          and de.owner_id = (select auth.uid())
          and de.video_id = verification_task_resolutions.source_video_id
          and de.review_state = 'human_confirmed'::public.radar_review_state
          and verification_task_resolutions.resolution_summary = de.claim
          and (
            (verification_task_resolutions.category = 'gameplay_mechanic' and de.event_key = 'mechanic')
            or (verification_task_resolutions.category = 'monetization_placement' and de.event_key = 'monetization')
            or (verification_task_resolutions.category = 'meta_progression' and de.event_key = 'progression')
            or (verification_task_resolutions.category = 'other_unknown' and de.event_key = 'other')
          )
      )
    )
  )
);

create policy "owner updates valid verification task resolutions"
on public.verification_task_resolutions
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.deep_verify_videos dv
    cross join lateral generate_subscripts(dv.verification_task_ids, 1) as s(i)
    where dv.id = verification_task_resolutions.source_video_id
      and dv.owner_id = (select auth.uid())
      and dv.verification_session_id = verification_task_resolutions.session_id
      and dv.verification_research_generated_at = verification_task_resolutions.research_generated_at
      and dv.verification_task_ids[s.i] = verification_task_resolutions.task_id
      and dv.verification_unknowns[s.i] = verification_task_resolutions.unknown_snapshot
      and dv.verification_categories[s.i] = verification_task_resolutions.category
  )
  and (
    (
      resolution_state = 'needs_more_evidence'
      and source_event_id is null
    )
    or
    (
      resolution_state = 'resolved'
      and exists (
        select 1
        from public.deep_verify_events de
        where de.id = verification_task_resolutions.source_event_id
          and de.owner_id = (select auth.uid())
          and de.video_id = verification_task_resolutions.source_video_id
          and de.review_state = 'human_confirmed'::public.radar_review_state
          and verification_task_resolutions.resolution_summary = de.claim
          and (
            (verification_task_resolutions.category = 'gameplay_mechanic' and de.event_key = 'mechanic')
            or (verification_task_resolutions.category = 'monetization_placement' and de.event_key = 'monetization')
            or (verification_task_resolutions.category = 'meta_progression' and de.event_key = 'progression')
            or (verification_task_resolutions.category = 'other_unknown' and de.event_key = 'other')
          )
      )
    )
  )
);

create policy "owner deletes verification task resolutions"
on public.verification_task_resolutions
for delete
to authenticated
using ((select auth.uid()) = owner_id);

create index if not exists verification_task_resolutions_owner_state_idx
  on public.verification_task_resolutions(owner_id, resolution_state, updated_at desc);

create index if not exists verification_task_resolutions_video_idx
  on public.verification_task_resolutions(source_video_id);

create index if not exists verification_task_resolutions_event_idx
  on public.verification_task_resolutions(source_event_id)
  where source_event_id is not null;
