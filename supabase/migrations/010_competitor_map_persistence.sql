create table public.competitor_relations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  primary_game_id uuid not null references public.games(id) on delete cascade,
  competitor_game_id uuid not null references public.games(id) on delete cascade,
  relationship text not null check (relationship in (
    'PREDECESSOR','REFERENCE_TITLE','DIRECT_COMPETITOR','FOLLOWER',
    'HIGH_SIMILARITY_FOLLOWER','DIFFERENTIATED_FOLLOWER','ADJACENT_SUBSTITUTE','NOT_RELEVANT'
  )),
  differentiation jsonb not null default '{}'::jsonb,
  primary_analysis jsonb not null,
  competitor_analysis jsonb not null,
  primary_observation_id uuid references public.observations(id) on delete set null,
  competitor_observation_id uuid references public.observations(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, primary_game_id, competitor_game_id),
  check (primary_game_id <> competitor_game_id)
);

create index competitor_relations_owner_primary_idx on public.competitor_relations(owner_id, primary_game_id);
create index competitor_relations_primary_game_idx on public.competitor_relations(primary_game_id);
create index competitor_relations_competitor_game_idx on public.competitor_relations(competitor_game_id);
create index competitor_relations_primary_observation_idx on public.competitor_relations(primary_observation_id);
create index competitor_relations_competitor_observation_idx on public.competitor_relations(competitor_observation_id);

alter table public.competitor_relations enable row level security;
create policy "owner manages competitor relations" on public.competitor_relations for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
grant select, insert, update, delete on public.competitor_relations to authenticated;

create or replace function public.save_competitor_map(p_primary jsonb, p_competitors jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_primary_game_id uuid;
  v_primary_observation_id uuid;
  v_primary_platform public.radar_platform;
  v_primary_store_id text;
  v_primary_observed_at timestamptz;
  v_item jsonb;
  v_analysis jsonb;
  v_comp_game_id uuid;
  v_comp_observation_id uuid;
  v_comp_platform public.radar_platform;
  v_comp_store_id text;
  v_comp_observed_at timestamptz;
  v_count integer := 0;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p_primary is null or p_primary->'game' is null then raise exception 'Invalid primary analysis'; end if;
  if jsonb_typeof(coalesce(p_competitors, '[]'::jsonb)) <> 'array' then raise exception 'Competitors must be an array'; end if;

  v_primary_platform := (p_primary->'game'->>'platform')::public.radar_platform;
  v_primary_store_id := p_primary->'game'->>'storeId';
  begin v_primary_observed_at := nullif(p_primary->>'sourceObservedAt','')::timestamptz; exception when others then v_primary_observed_at := null; end;
  v_primary_observed_at := coalesce(v_primary_observed_at, now());

  select sa.game_id into v_primary_game_id from public.store_apps sa
   where sa.owner_id=v_owner and sa.platform=v_primary_platform and sa.store_id=v_primary_store_id limit 1;
  if v_primary_game_id is null then
    insert into public.games(owner_id,canonical_name,publisher) values(v_owner,p_primary->'game'->>'canonicalName',nullif(p_primary->'game'->>'publisher','')) returning id into v_primary_game_id;
    insert into public.store_apps(owner_id,game_id,platform,store_id,store_url)
      values(v_owner,v_primary_game_id,v_primary_platform,v_primary_store_id,p_primary->'game'->>'storeUrl');
  else
    update public.games set canonical_name=p_primary->'game'->>'canonicalName',publisher=nullif(p_primary->'game'->>'publisher',''),updated_at=now()
      where id=v_primary_game_id and owner_id=v_owner;
  end if;

  insert into public.observations(owner_id,game_id,origin,source_name,source_url,raw_value,observed_at)
  values(v_owner,v_primary_game_id,'official_public','Apple App Store lookup response',p_primary->'game'->>'storeUrl',coalesce(p_primary->'rawSource',p_primary),v_primary_observed_at)
  returning id into v_primary_observation_id;

  delete from public.competitor_relations where owner_id=v_owner and primary_game_id=v_primary_game_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_competitors,'[]'::jsonb)) loop
    v_analysis := v_item->'analysis';
    if v_analysis is null or v_analysis->'game' is null then raise exception 'Invalid competitor analysis'; end if;
    if not ((v_item->>'relationship') = any(array['PREDECESSOR','REFERENCE_TITLE','DIRECT_COMPETITOR','FOLLOWER','HIGH_SIMILARITY_FOLLOWER','DIFFERENTIATED_FOLLOWER','ADJACENT_SUBSTITUTE','NOT_RELEVANT'])) then raise exception 'Invalid relationship'; end if;

    v_comp_platform := (v_analysis->'game'->>'platform')::public.radar_platform;
    v_comp_store_id := v_analysis->'game'->>'storeId';
    if v_comp_platform=v_primary_platform and v_comp_store_id=v_primary_store_id then raise exception 'A game cannot compete with itself'; end if;
    begin v_comp_observed_at := nullif(v_analysis->>'sourceObservedAt','')::timestamptz; exception when others then v_comp_observed_at := null; end;
    v_comp_observed_at := coalesce(v_comp_observed_at,now());

    select sa.game_id into v_comp_game_id from public.store_apps sa
      where sa.owner_id=v_owner and sa.platform=v_comp_platform and sa.store_id=v_comp_store_id limit 1;
    if v_comp_game_id is null then
      insert into public.games(owner_id,canonical_name,publisher) values(v_owner,v_analysis->'game'->>'canonicalName',nullif(v_analysis->'game'->>'publisher','')) returning id into v_comp_game_id;
      insert into public.store_apps(owner_id,game_id,platform,store_id,store_url)
        values(v_owner,v_comp_game_id,v_comp_platform,v_comp_store_id,v_analysis->'game'->>'storeUrl');
    else
      update public.games set canonical_name=v_analysis->'game'->>'canonicalName',publisher=nullif(v_analysis->'game'->>'publisher',''),updated_at=now()
        where id=v_comp_game_id and owner_id=v_owner;
    end if;

    insert into public.observations(owner_id,game_id,origin,source_name,source_url,raw_value,observed_at)
    values(v_owner,v_comp_game_id,'official_public','Apple App Store lookup response',v_analysis->'game'->>'storeUrl',coalesce(v_analysis->'rawSource',v_analysis),v_comp_observed_at)
    returning id into v_comp_observation_id;

    insert into public.competitor_relations(owner_id,primary_game_id,competitor_game_id,relationship,differentiation,primary_analysis,competitor_analysis,primary_observation_id,competitor_observation_id)
    values(v_owner,v_primary_game_id,v_comp_game_id,v_item->>'relationship',coalesce(v_item->'differentiation','{}'::jsonb),p_primary,v_analysis,v_primary_observation_id,v_comp_observation_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.load_competitor_map(p_primary_store_id text)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  with rows as (
    select cr.*
    from public.competitor_relations cr
    join public.store_apps sa on sa.game_id=cr.primary_game_id and sa.owner_id=cr.owner_id
    where cr.owner_id=auth.uid() and sa.store_id=p_primary_store_id
  )
  select case when not exists(select 1 from rows) then null else jsonb_build_object(
    'primary', (select primary_analysis from rows order by confirmed_at limit 1),
    'competitors', (select jsonb_agg(jsonb_build_object(
      'id', id,
      'analysis', competitor_analysis,
      'relationship', relationship,
      'differentiation', differentiation,
      'confirmedAt', confirmed_at,
      'updatedAt', updated_at
    ) order by confirmed_at) from rows)
  ) end;
$$;

revoke all on function public.save_competitor_map(jsonb,jsonb) from public, anon;
revoke all on function public.load_competitor_map(text) from public, anon;
grant execute on function public.save_competitor_map(jsonb,jsonb) to authenticated;
grant execute on function public.load_competitor_map(text) to authenticated;