create or replace function public.list_research_evidence_coverage(p_store_ids text[])
returns table (
  store_id text,
  game_id uuid,
  competitor_relation_count bigint,
  review_sample_count bigint,
  review_entry_count bigint,
  deep_verify_video_count bigint,
  deep_verify_completed_count bigint,
  deep_verify_event_count bigint,
  deep_verify_human_confirmed_event_count bigint,
  scorecard_count bigint,
  latest_decision_status text,
  latest_decision_at timestamptz,
  latest_competitor_at timestamptz,
  latest_review_at timestamptz,
  latest_deep_verify_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_requested_count integer := coalesce(cardinality(p_store_ids), 0);
begin
  if v_owner is null then
    raise exception 'Authentication required';
  end if;

  if v_requested_count = 0 then
    return;
  end if;

  if v_requested_count > 20 then
    raise exception 'Research evidence coverage accepts at most 20 store IDs per call';
  end if;

  return query
  with requested as (
    select distinct btrim(value) as store_id
    from unnest(p_store_ids) as value
    where value is not null
      and btrim(value) <> ''
  ),
  mapped as (
    select
      r.store_id,
      (
        select sa.game_id
        from public.store_apps sa
        where sa.owner_id = v_owner
          and sa.store_id = r.store_id
        order by sa.created_at desc
        limit 1
      ) as game_id
    from requested r
  )
  select
    m.store_id,
    m.game_id,
    coalesce((
      select count(*)
      from public.competitor_relations cr
      where cr.owner_id = v_owner
        and m.game_id is not null
        and cr.primary_game_id = m.game_id
    ), 0)::bigint as competitor_relation_count,
    coalesce((
      select count(*)
      from public.review_samples rs
      where rs.owner_id = v_owner
        and m.game_id is not null
        and rs.game_id = m.game_id
    ), 0)::bigint as review_sample_count,
    coalesce((
      select count(*)
      from public.review_entries re
      join public.review_samples rs
        on rs.id = re.sample_id
       and rs.owner_id = v_owner
      where re.owner_id = v_owner
        and m.game_id is not null
        and rs.game_id = m.game_id
    ), 0)::bigint as review_entry_count,
    coalesce((
      select count(*)
      from public.deep_verify_videos dv
      where dv.owner_id = v_owner
        and (
          dv.store_id = m.store_id
          or (m.game_id is not null and dv.game_id = m.game_id)
        )
    ), 0)::bigint as deep_verify_video_count,
    coalesce((
      select count(*)
      from public.deep_verify_videos dv
      where dv.owner_id = v_owner
        and dv.status = 'completed'
        and (
          dv.store_id = m.store_id
          or (m.game_id is not null and dv.game_id = m.game_id)
        )
    ), 0)::bigint as deep_verify_completed_count,
    coalesce((
      select count(*)
      from public.deep_verify_events de
      join public.deep_verify_videos dv
        on dv.id = de.video_id
       and dv.owner_id = v_owner
      where de.owner_id = v_owner
        and (
          dv.store_id = m.store_id
          or (m.game_id is not null and dv.game_id = m.game_id)
        )
    ), 0)::bigint as deep_verify_event_count,
    coalesce((
      select count(*)
      from public.deep_verify_events de
      join public.deep_verify_videos dv
        on dv.id = de.video_id
       and dv.owner_id = v_owner
      where de.owner_id = v_owner
        and de.review_state = 'human_confirmed'
        and (
          dv.store_id = m.store_id
          or (m.game_id is not null and dv.game_id = m.game_id)
        )
    ), 0)::bigint as deep_verify_human_confirmed_event_count,
    coalesce((
      select count(*)
      from public.scorecards sc
      where sc.owner_id = v_owner
        and m.game_id is not null
        and sc.game_id = m.game_id
    ), 0)::bigint as scorecard_count,
    (
      select sc.decision_status
      from public.scorecards sc
      where sc.owner_id = v_owner
        and m.game_id is not null
        and sc.game_id = m.game_id
      order by sc.created_at desc
      limit 1
    ) as latest_decision_status,
    (
      select sc.created_at
      from public.scorecards sc
      where sc.owner_id = v_owner
        and m.game_id is not null
        and sc.game_id = m.game_id
      order by sc.created_at desc
      limit 1
    ) as latest_decision_at,
    (
      select max(cr.updated_at)
      from public.competitor_relations cr
      where cr.owner_id = v_owner
        and m.game_id is not null
        and cr.primary_game_id = m.game_id
    ) as latest_competitor_at,
    (
      select max(rs.created_at)
      from public.review_samples rs
      where rs.owner_id = v_owner
        and m.game_id is not null
        and rs.game_id = m.game_id
    ) as latest_review_at,
    (
      select max(dv.updated_at)
      from public.deep_verify_videos dv
      where dv.owner_id = v_owner
        and (
          dv.store_id = m.store_id
          or (m.game_id is not null and dv.game_id = m.game_id)
        )
    ) as latest_deep_verify_at
  from mapped m
  order by m.store_id;
end;
$$;

revoke all on function public.list_research_evidence_coverage(text[]) from public;
revoke all on function public.list_research_evidence_coverage(text[]) from anon;
grant execute on function public.list_research_evidence_coverage(text[]) to authenticated;
