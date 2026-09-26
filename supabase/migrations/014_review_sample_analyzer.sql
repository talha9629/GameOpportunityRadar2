create table public.review_samples (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  game_id uuid references public.games(id) on delete set null,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  analysis_method text not null,
  entry_count integer not null check (entry_count between 1 and 500),
  created_at timestamptz not null default now()
);

create index review_samples_owner_created_idx on public.review_samples(owner_id, created_at desc);
create index review_samples_game_idx on public.review_samples(game_id);

create table public.review_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  sample_id uuid not null references public.review_samples(id) on delete cascade,
  sequence integer not null check (sequence >= 1),
  rating smallint check (rating between 1 and 5),
  review_text text not null check (char_length(btrim(review_text)) between 1 and 4000),
  labels jsonb not null default '[]'::jsonb check (jsonb_typeof(labels) = 'array'),
  created_at timestamptz not null default now(),
  unique(sample_id, sequence)
);

create index review_entries_owner_sample_idx on public.review_entries(owner_id, sample_id);

create table public.review_clusters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  sample_id uuid not null references public.review_samples(id) on delete cascade,
  cluster_key text not null check (cluster_key in (
    'positive','negative','ads','difficulty','monetization','repetition','bugs','requests','quit_reasons'
  )),
  label text not null,
  review_count integer not null check (review_count >= 0),
  sample_share numeric not null check (sample_share >= 0 and sample_share <= 1),
  evidence_sequences jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_sequences) = 'array'),
  created_at timestamptz not null default now(),
  unique(sample_id, cluster_key)
);

create index review_clusters_owner_sample_idx on public.review_clusters(owner_id, sample_id);

alter table public.review_samples enable row level security;
alter table public.review_entries enable row level security;
alter table public.review_clusters enable row level security;

grant select, insert, update, delete on public.review_samples to authenticated;
grant select, insert, update, delete on public.review_entries to authenticated;
grant select, insert, update, delete on public.review_clusters to authenticated;

create policy "owner manages review samples"
  on public.review_samples for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "owner manages review entries"
  on public.review_entries for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "owner manages review clusters"
  on public.review_clusters for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create or replace function public.save_review_sample(
  p_label text,
  p_store_id text,
  p_entries jsonb,
  p_clusters jsonb,
  p_analysis_method text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_game_id uuid;
  v_sample_id uuid;
  v_entry jsonb;
  v_cluster jsonb;
  v_entry_count integer;
  v_sequence integer;
  v_rating smallint;
  v_review_count integer;
  v_sample_share numeric;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p_label is null or char_length(btrim(p_label)) < 1 or char_length(btrim(p_label)) > 160 then
    raise exception 'Sample label must be 1-160 characters';
  end if;
  if p_analysis_method is null or char_length(btrim(p_analysis_method)) < 1 then
    raise exception 'Analysis method is required';
  end if;
  if jsonb_typeof(coalesce(p_entries, 'null'::jsonb)) <> 'array' then raise exception 'Entries must be an array'; end if;
  if jsonb_typeof(coalesce(p_clusters, 'null'::jsonb)) <> 'array' then raise exception 'Clusters must be an array'; end if;

  v_entry_count := jsonb_array_length(p_entries);
  if v_entry_count < 1 or v_entry_count > 500 then raise exception 'Review sample must contain 1-500 entries'; end if;

  if nullif(btrim(coalesce(p_store_id, '')), '') is not null then
    select sa.game_id into v_game_id
      from public.store_apps sa
     where sa.owner_id = v_owner and sa.store_id = btrim(p_store_id)
     order by sa.created_at desc
     limit 1;
  end if;

  insert into public.review_samples(owner_id, game_id, label, analysis_method, entry_count)
  values(v_owner, v_game_id, btrim(p_label), p_analysis_method, v_entry_count)
  returning id into v_sample_id;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_sequence := nullif(v_entry->>'sequence', '')::integer;
    if v_sequence is null or v_sequence < 1 then raise exception 'Invalid review sequence'; end if;
    if char_length(btrim(coalesce(v_entry->>'text', ''))) < 1 or char_length(btrim(v_entry->>'text')) > 4000 then
      raise exception 'Review text must be 1-4000 characters';
    end if;
    if v_entry->>'rating' is null or v_entry->'rating' = 'null'::jsonb then
      v_rating := null;
    else
      v_rating := (v_entry->>'rating')::smallint;
      if v_rating < 1 or v_rating > 5 then raise exception 'Review rating must be 1-5'; end if;
    end if;
    if jsonb_typeof(coalesce(v_entry->'labels', '[]'::jsonb)) <> 'array' then raise exception 'Review labels must be an array'; end if;

    insert into public.review_entries(owner_id, sample_id, sequence, rating, review_text, labels)
    values(v_owner, v_sample_id, v_sequence, v_rating, btrim(v_entry->>'text'), coalesce(v_entry->'labels', '[]'::jsonb));
  end loop;

  for v_cluster in select value from jsonb_array_elements(p_clusters) loop
    if not ((v_cluster->>'clusterKey') = any(array[
      'positive','negative','ads','difficulty','monetization','repetition','bugs','requests','quit_reasons'
    ])) then raise exception 'Invalid review cluster key'; end if;
    v_review_count := coalesce((v_cluster->>'reviewCount')::integer, 0);
    v_sample_share := coalesce((v_cluster->>'sampleShare')::numeric, 0);
    if v_review_count < 0 or v_review_count > v_entry_count then raise exception 'Invalid review cluster count'; end if;
    if v_sample_share < 0 or v_sample_share > 1 then raise exception 'Invalid review cluster share'; end if;
    if abs(v_sample_share - (v_review_count::numeric / v_entry_count::numeric)) > 0.000001 then
      raise exception 'Review cluster share does not match sample count';
    end if;
    if jsonb_typeof(coalesce(v_cluster->'evidenceSequences', '[]'::jsonb)) <> 'array' then raise exception 'Evidence sequences must be an array'; end if;

    insert into public.review_clusters(
      owner_id, sample_id, cluster_key, label, review_count, sample_share, evidence_sequences
    ) values (
      v_owner, v_sample_id, v_cluster->>'clusterKey', v_cluster->>'label', v_review_count,
      v_sample_share, coalesce(v_cluster->'evidenceSequences', '[]'::jsonb)
    );
  end loop;

  return v_sample_id;
end;
$$;

create or replace function public.list_review_samples()
returns table (
  sample_id uuid,
  label text,
  canonical_name text,
  store_id text,
  analysis_method text,
  entry_count integer,
  created_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  select
    rs.id,
    rs.label,
    g.canonical_name,
    sa.store_id,
    rs.analysis_method,
    rs.entry_count,
    rs.created_at
  from public.review_samples rs
  left join public.games g on g.id = rs.game_id and g.owner_id = auth.uid()
  left join lateral (
    select s.store_id
      from public.store_apps s
     where s.game_id = rs.game_id and s.owner_id = auth.uid()
     order by s.created_at asc
     limit 1
  ) sa on true
  where rs.owner_id = auth.uid()
  order by rs.created_at desc;
$$;

create or replace function public.load_review_sample(p_sample_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'sampleId', rs.id,
    'label', rs.label,
    'storeId', sa.store_id,
    'canonicalName', g.canonical_name,
    'analysisMethod', rs.analysis_method,
    'createdAt', rs.created_at,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sequence', re.sequence,
        'rating', re.rating,
        'text', re.review_text,
        'labels', re.labels
      ) order by re.sequence)
      from public.review_entries re
      where re.sample_id = rs.id and re.owner_id = auth.uid()
    ), '[]'::jsonb),
    'clusters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clusterKey', rc.cluster_key,
        'label', rc.label,
        'reviewCount', rc.review_count,
        'sampleShare', rc.sample_share,
        'evidenceSequences', rc.evidence_sequences
      ) order by rc.review_count desc, rc.cluster_key)
      from public.review_clusters rc
      where rc.sample_id = rs.id and rc.owner_id = auth.uid()
    ), '[]'::jsonb)
  )
  from public.review_samples rs
  left join public.games g on g.id = rs.game_id and g.owner_id = auth.uid()
  left join lateral (
    select s.store_id
      from public.store_apps s
     where s.game_id = rs.game_id and s.owner_id = auth.uid()
     order by s.created_at asc
     limit 1
  ) sa on true
  where rs.id = p_sample_id and rs.owner_id = auth.uid()
  limit 1;
$$;

revoke all on function public.save_review_sample(text, text, jsonb, jsonb, text) from PUBLIC;
revoke all on function public.save_review_sample(text, text, jsonb, jsonb, text) from anon;
grant execute on function public.save_review_sample(text, text, jsonb, jsonb, text) to authenticated;

revoke all on function public.list_review_samples() from PUBLIC;
revoke all on function public.list_review_samples() from anon;
grant execute on function public.list_review_samples() to authenticated;

revoke all on function public.load_review_sample(uuid) from PUBLIC;
revoke all on function public.load_review_sample(uuid) from anon;
grant execute on function public.load_review_sample(uuid) to authenticated;
