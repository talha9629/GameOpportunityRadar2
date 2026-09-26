do $$
begin
  if not exists (select 1 from pg_type where typname = 'radar_policy_review_state' and typnamespace = 'public'::regnamespace) then
    create type public.radar_policy_review_state as enum (
      'new_change', 'reviewing', 'relevant', 'not_relevant', 'closed', 'needs_follow_up'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'radar_policy_severity' and typnamespace = 'public'::regnamespace) then
    create type public.radar_policy_severity as enum ('informational', 'possible_impact', 'material');
  end if;
end $$;

create table if not exists public.policy_change_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  change_id text not null check (change_id ~ '^[a-f0-9]{64}$'),
  source_id text not null check (char_length(source_id) between 3 and 120),
  state public.radar_policy_review_state not null default 'new_change',
  severity public.radar_policy_severity,
  affected_dimensions text[] not null default '{}',
  notes text not null default '' check (char_length(notes) <= 4000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, change_id),
  check (coalesce(array_length(affected_dimensions, 1), 0) <= 20)
);

alter table public.policy_change_reviews enable row level security;

drop policy if exists "owner manages policy change reviews" on public.policy_change_reviews;
create policy "owner manages policy change reviews"
  on public.policy_change_reviews
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.policy_change_reviews to authenticated;
revoke all on public.policy_change_reviews from anon;

create index if not exists policy_change_reviews_owner_updated_idx
  on public.policy_change_reviews(owner_id, updated_at desc);

create or replace function public.enforce_policy_review_integrity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.state = 'new_change' then
    new.reviewed_at := null;
  elsif new.reviewed_at is null then
    new.reviewed_at := now();
  end if;

  if new.state in ('relevant', 'not_relevant', 'closed', 'needs_follow_up') and new.severity is null then
    raise exception 'A reviewed policy change requires a severity classification';
  end if;

  return new;
end;
$$;

drop trigger if exists policy_change_reviews_integrity on public.policy_change_reviews;
create trigger policy_change_reviews_integrity
before insert or update on public.policy_change_reviews
for each row execute function public.enforce_policy_review_integrity();

revoke all on function public.enforce_policy_review_integrity() from public, anon, authenticated;
