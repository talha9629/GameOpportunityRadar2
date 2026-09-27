do $$
begin
  if not exists (select 1 from pg_type where typname = 'radar_storefront' and typnamespace = 'public'::regnamespace) then
    create type public.radar_storefront as enum ('apple_app_store','google_play','amazon_appstore');
  end if;
end $$;

alter table public.store_apps add column if not exists storefront public.radar_storefront;

update public.store_apps
set storefront = case
  when platform = 'ios'::public.radar_platform then 'apple_app_store'::public.radar_storefront
  when store_url ilike '%play.google.com/%' then 'google_play'::public.radar_storefront
  when store_url ilike '%amazon.%' then 'amazon_appstore'::public.radar_storefront
  else storefront
end
where storefront is null;

alter table public.store_apps alter column storefront set not null;

alter table public.store_apps drop constraint if exists store_apps_storefront_platform_consistency;
alter table public.store_apps add constraint store_apps_storefront_platform_consistency check (
  (storefront = 'apple_app_store'::public.radar_storefront and platform = 'ios'::public.radar_platform)
  or (storefront in ('google_play'::public.radar_storefront,'amazon_appstore'::public.radar_storefront) and platform = 'android'::public.radar_platform)
);

alter table public.store_apps drop constraint if exists store_apps_owner_id_platform_store_id_key;
alter table public.store_apps add constraint store_apps_owner_storefront_store_id_key unique (owner_id, storefront, store_id);
create index if not exists store_apps_owner_platform_idx on public.store_apps(owner_id, platform);

alter table public.review_samples
  add column if not exists storefront public.radar_storefront,
  add column if not exists store_id text,
  add column if not exists store_app_id uuid references public.store_apps(id) on delete set null;

alter table public.review_samples drop constraint if exists review_samples_store_identity_pair;
alter table public.review_samples add constraint review_samples_store_identity_pair check (
  (storefront is null and store_id is null and store_app_id is null)
  or (storefront is not null and store_id is not null and btrim(store_id) <> '')
);
create index if not exists review_samples_store_app_idx on public.review_samples(store_app_id);
create index if not exists review_samples_owner_storefront_store_id_idx on public.review_samples(owner_id, storefront, store_id) where storefront is not null;

alter table public.deep_verify_videos
  add column if not exists storefront public.radar_storefront,
  add column if not exists store_app_id uuid references public.store_apps(id) on delete set null;

alter table public.deep_verify_videos drop constraint if exists deep_verify_store_identity_pair;
alter table public.deep_verify_videos add constraint deep_verify_store_identity_pair check (
  (storefront is null and store_id is null and store_app_id is null)
  or (storefront is not null and store_id is not null and btrim(store_id) <> '')
);
create index if not exists deep_verify_videos_store_app_idx on public.deep_verify_videos(store_app_id);
create index if not exists deep_verify_videos_owner_storefront_store_id_idx on public.deep_verify_videos(owner_id, storefront, store_id) where storefront is not null;

alter table public.deep_verify_videos drop constraint if exists deep_verify_verification_session_cardinality;
alter table public.deep_verify_videos add constraint deep_verify_verification_session_cardinality check (
  cardinality(verification_task_ids) <= 8
  and cardinality(verification_task_ids) = cardinality(verification_unknowns)
  and cardinality(verification_task_ids) = cardinality(verification_categories)
  and (
    (
      verification_session_id is null
      and cardinality(verification_task_ids) = 0
      and verification_research_generated_at is null
    )
    or (
      verification_session_id is not null
      and cardinality(verification_task_ids) between 1 and 8
      and verification_research_generated_at is not null
      and storefront is not null
      and store_id is not null
      and btrim(store_id) <> ''
    )
  )
);

create or replace function public.save_review_sample_v2(
  p_label text,
  p_storefront public.radar_storefront,
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
  v_store_app_id uuid;
  v_store_id text := nullif(btrim(coalesce(p_store_id, '')), '');
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
  if p_label is null or char_length(btrim(p_label)) < 1 or char_length(btrim(p_label)) > 160 then raise exception 'Sample label must be 1-160 characters'; end if;
  if p_analysis_method is null or char_length(btrim(p_analysis_method)) < 1 then raise exception 'Analysis method is required'; end if;
  if (p_storefront is null) <> (v_store_id is null) then raise exception 'Storefront and store ID must be supplied together'; end if;
  if jsonb_typeof(coalesce(p_entries, 'null'::jsonb)) <> 'array' then raise exception 'Entries must be an array'; end if;
  if jsonb_typeof(coalesce(p_clusters, 'null'::jsonb)) <> 'array' then raise exception 'Clusters must be an array'; end if;

  v_entry_count := jsonb_array_length(p_entries);
  if v_entry_count < 1 or v_entry_count > 500 then raise exception 'Review sample must contain 1-500 entries'; end if;

  if v_store_id is not null then
    select sa.id, sa.game_id into v_store_app_id, v_game_id
    from public.store_apps sa
    where sa.owner_id = v_owner and sa.storefront = p_storefront and sa.store_id = v_store_id
    order by sa.created_at desc
    limit 1;
  end if;

  insert into public.review_samples(owner_id, game_id, storefront, store_id, store_app_id, label, analysis_method, entry_count)
  values(v_owner, v_game_id, p_storefront, v_store_id, v_store_app_id, btrim(p_label), p_analysis_method, v_entry_count)
  returning id into v_sample_id;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_sequence := nullif(v_entry->>'sequence', '')::integer;
    if v_sequence is null or v_sequence < 1 then raise exception 'Invalid review sequence'; end if;
    if char_length(btrim(coalesce(v_entry->>'text', ''))) < 1 or char_length(btrim(v_entry->>'text')) > 4000 then raise exception 'Review text must be 1-4000 characters'; end if;
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
    if not ((v_cluster->>'clusterKey') = any(array['positive','negative','ads','difficulty','monetization','repetition','bugs','requests','quit_reasons'])) then raise exception 'Invalid review cluster key'; end if;
    v_review_count := coalesce((v_cluster->>'reviewCount')::integer, 0);
    v_sample_share := coalesce((v_cluster->>'sampleShare')::numeric, 0);
    if v_review_count < 0 or v_review_count > v_entry_count then raise exception 'Invalid review cluster count'; end if;
    if v_sample_share < 0 or v_sample_share > 1 then raise exception 'Invalid review cluster share'; end if;
    if abs(v_sample_share - (v_review_count::numeric / v_entry_count::numeric)) > 0.000001 then raise exception 'Review cluster share does not match sample count'; end if;
    if jsonb_typeof(coalesce(v_cluster->'evidenceSequences', '[]'::jsonb)) <> 'array' then raise exception 'Evidence sequences must be an array'; end if;
    insert into public.review_clusters(owner_id, sample_id, cluster_key, label, review_count, sample_share, evidence_sequences)
    values(v_owner, v_sample_id, v_cluster->>'clusterKey', v_cluster->>'label', v_review_count, v_sample_share, coalesce(v_cluster->'evidenceSequences', '[]'::jsonb));
  end loop;

  return v_sample_id;
end;
$$;

create or replace function public.save_review_sample(
  p_label text,
  p_store_id text,
  p_entries jsonb,
  p_clusters jsonb,
  p_analysis_method text
)
returns uuid
language sql
security invoker
set search_path = public
as $$
  select public.save_review_sample_v2(
    p_label,
    case when nullif(btrim(coalesce(p_store_id, '')), '') is null then null else 'apple_app_store'::public.radar_storefront end,
    p_store_id,
    p_entries,
    p_clusters,
    p_analysis_method
  );
$$;

create or replace function public.list_review_samples_v2()
returns table (
  sample_id uuid,
  label text,
  canonical_name text,
  storefront public.radar_storefront,
  store_id text,
  analysis_method text,
  entry_count integer,
  created_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  select rs.id, rs.label, g.canonical_name, rs.storefront, rs.store_id, rs.analysis_method, rs.entry_count, rs.created_at
  from public.review_samples rs
  left join public.games g on g.id = rs.game_id and g.owner_id = auth.uid()
  where rs.owner_id = auth.uid()
  order by rs.created_at desc;
$$;

create or replace function public.load_review_sample_v2(p_sample_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'sampleId', rs.id,
    'label', rs.label,
    'storefront', rs.storefront,
    'storeId', rs.store_id,
    'canonicalName', g.canonical_name,
    'analysisMethod', rs.analysis_method,
    'createdAt', rs.created_at,
    'entries', coalesce((select jsonb_agg(jsonb_build_object('sequence', re.sequence,'rating',re.rating,'text',re.review_text,'labels',re.labels) order by re.sequence) from public.review_entries re where re.sample_id=rs.id and re.owner_id=auth.uid()), '[]'::jsonb),
    'clusters', coalesce((select jsonb_agg(jsonb_build_object('clusterKey',rc.cluster_key,'label',rc.label,'reviewCount',rc.review_count,'sampleShare',rc.sample_share,'evidenceSequences',rc.evidence_sequences) order by rc.review_count desc, rc.cluster_key) from public.review_clusters rc where rc.sample_id=rs.id and rc.owner_id=auth.uid()), '[]'::jsonb)
  )
  from public.review_samples rs
  left join public.games g on g.id=rs.game_id and g.owner_id=auth.uid()
  where rs.id=p_sample_id and rs.owner_id=auth.uid()
  limit 1;
$$;

create or replace function public.register_deep_verify_video_v2(
  p_label text,
  p_storefront public.radar_storefront,
  p_store_id text,
  p_source_type text,
  p_storage_path text,
  p_external_url text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_seconds numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_game_id uuid;
  v_store_app_id uuid;
  v_video_id uuid;
  v_source_type text := btrim(coalesce(p_source_type, ''));
  v_label text := btrim(coalesce(p_label, ''));
  v_store_id text := nullif(btrim(coalesce(p_store_id, '')), '');
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if char_length(v_label) < 1 or char_length(v_label) > 160 then raise exception 'Video label must be 1-160 characters'; end if;
  if (p_storefront is null) <> (v_store_id is null) then raise exception 'Storefront and store ID must be supplied together'; end if;
  if v_source_type not in ('upload','youtube_url') then raise exception 'Invalid Deep Verify source type'; end if;
  if v_source_type = 'upload' then
    if p_storage_path is null or btrim(p_storage_path) = '' then raise exception 'Uploaded evidence requires a storage path'; end if;
    if split_part(p_storage_path, '/', 1) <> v_owner::text then raise exception 'Storage path must be scoped to the authenticated owner'; end if;
    if p_external_url is not null and btrim(p_external_url) <> '' then raise exception 'Uploaded evidence cannot also have an external URL'; end if;
    if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 524288000 then raise exception 'Uploaded video must be between 1 byte and 500 MB'; end if;
    if p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > 1800 then raise exception 'Uploaded video must be 30 minutes or shorter'; end if;
    if p_mime_type not in ('video/mp4','video/quicktime','video/webm','video/x-m4v') then raise exception 'Unsupported video MIME type'; end if;
  else
    if p_external_url is null or btrim(p_external_url) = '' then raise exception 'YouTube evidence requires a public URL'; end if;
    if p_storage_path is not null and btrim(p_storage_path) <> '' then raise exception 'YouTube evidence cannot also have a storage path'; end if;
  end if;

  if v_store_id is not null then
    select sa.id, sa.game_id into v_store_app_id, v_game_id
    from public.store_apps sa
    where sa.owner_id=v_owner and sa.storefront=p_storefront and sa.store_id=v_store_id
    order by sa.created_at desc
    limit 1;
  end if;

  insert into public.deep_verify_videos(owner_id,game_id,storefront,store_id,store_app_id,label,source_type,storage_path,external_url,original_name,mime_type,size_bytes,duration_seconds,status,delete_after)
  values(v_owner,v_game_id,p_storefront,v_store_id,v_store_app_id,v_label,v_source_type,
    case when v_source_type='upload' then btrim(p_storage_path) else null end,
    case when v_source_type='youtube_url' then btrim(p_external_url) else null end,
    nullif(btrim(coalesce(p_original_name,'')),''),nullif(btrim(coalesce(p_mime_type,'')),''),p_size_bytes,p_duration_seconds,'provider_required',null)
  returning id into v_video_id;
  return v_video_id;
end;
$$;

create or replace function public.register_deep_verify_video(
  p_label text,p_store_id text,p_source_type text,p_storage_path text,p_external_url text,p_original_name text,p_mime_type text,p_size_bytes bigint,p_duration_seconds numeric
)
returns uuid
language sql
security invoker
set search_path = public
as $$
  select public.register_deep_verify_video_v2(
    p_label,
    case when nullif(btrim(coalesce(p_store_id,'')),'') is null then null else 'apple_app_store'::public.radar_storefront end,
    p_store_id,p_source_type,p_storage_path,p_external_url,p_original_name,p_mime_type,p_size_bytes,p_duration_seconds
  );
$$;

create or replace function public.register_deep_verify_video_with_session_v2(
  p_label text,
  p_storefront public.radar_storefront,
  p_store_id text,
  p_source_type text,
  p_storage_path text,
  p_external_url text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_seconds numeric,
  p_verification_session_id text,
  p_verification_task_ids text[],
  p_verification_unknowns text[],
  p_verification_categories text[],
  p_verification_research_generated_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_video_id uuid;
  v_session_id text := btrim(coalesce(p_verification_session_id, ''));
  v_store_id text := nullif(btrim(coalesce(p_store_id, '')), '');
  v_task_ids text[] := coalesce(p_verification_task_ids, '{}'::text[]);
  v_unknowns text[] := coalesce(p_verification_unknowns, '{}'::text[]);
  v_categories text[] := coalesce(p_verification_categories, '{}'::text[]);
  v_task_id text;
  v_unknown text;
  v_category text;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p_storefront is null or v_store_id is null then raise exception 'Verification-session evidence requires a storefront and store ID'; end if;
  if v_session_id !~ '^[a-f0-9]{24}$' then raise exception 'Invalid verification session ID'; end if;
  if cardinality(v_task_ids) < 1 or cardinality(v_task_ids) > 8 then raise exception 'Verification session must contain 1-8 task IDs'; end if;
  if cardinality(v_task_ids) <> cardinality(v_unknowns) or cardinality(v_task_ids) <> cardinality(v_categories) then raise exception 'Verification session task, unknown, and category counts must match'; end if;
  if (select count(distinct task_id) from unnest(v_task_ids) as task_id) <> cardinality(v_task_ids) then raise exception 'Verification task IDs must be unique'; end if;
  if p_verification_research_generated_at is null then raise exception 'Verification session research timestamp is required'; end if;
  foreach v_task_id in array v_task_ids loop if v_task_id !~ '^[a-f0-9]{24}$' then raise exception 'Invalid verification task ID'; end if; end loop;
  foreach v_unknown in array v_unknowns loop if char_length(btrim(coalesce(v_unknown,''))) < 15 or char_length(v_unknown) > 2000 then raise exception 'Verification unknown must be 15-2000 characters'; end if; end loop;
  foreach v_category in array v_categories loop if v_category not in ('gameplay_mechanic','monetization_placement','meta_progression','other_unknown') then raise exception 'Invalid verification category'; end if; end loop;

  v_video_id := public.register_deep_verify_video_v2(p_label,p_storefront,v_store_id,p_source_type,p_storage_path,p_external_url,p_original_name,p_mime_type,p_size_bytes,p_duration_seconds);
  update public.deep_verify_videos
  set verification_session_id=v_session_id,verification_task_ids=v_task_ids,verification_unknowns=v_unknowns,verification_categories=v_categories,verification_research_generated_at=p_verification_research_generated_at,updated_at=now()
  where id=v_video_id and owner_id=v_owner;
  if not found then raise exception 'Deep Verify evidence registration was not owner-accessible'; end if;
  return v_video_id;
end;
$$;

create or replace function public.register_deep_verify_video_with_session(
  p_label text,p_store_id text,p_source_type text,p_storage_path text,p_external_url text,p_original_name text,p_mime_type text,p_size_bytes bigint,p_duration_seconds numeric,p_verification_session_id text,p_verification_task_ids text[],p_verification_unknowns text[],p_verification_categories text[],p_verification_research_generated_at timestamptz
)
returns uuid
language sql
security invoker
set search_path = public
as $$
  select public.register_deep_verify_video_with_session_v2(
    p_label,'apple_app_store'::public.radar_storefront,p_store_id,p_source_type,p_storage_path,p_external_url,p_original_name,p_mime_type,p_size_bytes,p_duration_seconds,p_verification_session_id,p_verification_task_ids,p_verification_unknowns,p_verification_categories,p_verification_research_generated_at
  );
$$;

create or replace function public.list_deep_verify_videos_v2()
returns table (
  video_id uuid,label text,canonical_name text,storefront public.radar_storefront,store_id text,source_type text,status text,provider text,model text,original_name text,size_bytes bigint,duration_seconds numeric,delete_after timestamptz,source_deleted_at timestamptz,created_at timestamptz,event_count bigint
)
language sql
security invoker
set search_path = public
as $$
  select dv.id,dv.label,g.canonical_name,dv.storefront,dv.store_id,dv.source_type,dv.status,dv.provider,dv.model,dv.original_name,dv.size_bytes,dv.duration_seconds,dv.delete_after,dv.source_deleted_at,dv.created_at,
    (select count(*) from public.deep_verify_events de where de.video_id=dv.id and de.owner_id=auth.uid())
  from public.deep_verify_videos dv
  left join public.games g on g.id=dv.game_id and g.owner_id=auth.uid()
  where dv.owner_id=auth.uid()
  order by dv.created_at desc;
$$;

create or replace function public.load_deep_verify_video_v2(p_video_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'videoId',dv.id,'label',dv.label,'canonicalName',g.canonical_name,'storefront',dv.storefront,'storeId',dv.store_id,'sourceType',dv.source_type,'storagePath',dv.storage_path,'externalUrl',dv.external_url,'originalName',dv.original_name,'mimeType',dv.mime_type,'sizeBytes',dv.size_bytes,'durationSeconds',dv.duration_seconds,'status',dv.status,'provider',dv.provider,'model',dv.model,'errorCode',dv.error_code,'errorMessage',dv.error_message,'deleteAfter',dv.delete_after,'sourceDeletedAt',dv.source_deleted_at,'createdAt',dv.created_at,
    'verificationSession',case when dv.verification_session_id is null then null else jsonb_build_object('sessionId',dv.verification_session_id,'taskIds',to_jsonb(dv.verification_task_ids),'unknowns',to_jsonb(dv.verification_unknowns),'categories',to_jsonb(dv.verification_categories),'researchGeneratedAt',dv.verification_research_generated_at) end,
    'latestAnalysis',(select jsonb_build_object('runId',ar.id,'status',ar.status,'provider',ar.provider,'model',ar.model,'estimatedCostUsd',ar.estimated_cost_usd,'startedAt',ar.started_at,'completedAt',ar.completed_at,'summary',ar.dossier_snapshot->>'summary','unknowns',coalesce(ar.dossier_snapshot->'unknowns','[]'::jsonb),'usage',ar.dossier_snapshot->'usage') from public.analysis_runs ar where ar.video_id=dv.id and ar.owner_id=auth.uid() and ar.run_type='deep_verify_video' order by ar.started_at desc limit 1),
    'events',coalesce((select jsonb_agg(jsonb_build_object('eventId',de.id,'analysisRunId',de.analysis_run_id,'eventKey',de.event_key,'label',de.label,'claim',de.claim,'startSeconds',de.start_seconds,'endSeconds',de.end_seconds,'origin',de.origin,'interpretation',de.interpretation,'coverage',de.coverage,'reviewState',de.review_state,'reviewedAt',de.reviewed_at,'confidence',de.confidence,'evidenceNote',de.evidence_note) order by de.start_seconds,de.created_at) from public.deep_verify_events de where de.video_id=dv.id and de.owner_id=auth.uid()),'[]'::jsonb)
  )
  from public.deep_verify_videos dv
  left join public.games g on g.id=dv.game_id and g.owner_id=auth.uid()
  where dv.id=p_video_id and dv.owner_id=auth.uid()
  limit 1;
$$;

revoke all on function public.save_review_sample_v2(text,public.radar_storefront,text,jsonb,jsonb,text) from public, anon;
grant execute on function public.save_review_sample_v2(text,public.radar_storefront,text,jsonb,jsonb,text) to authenticated;
revoke all on function public.list_review_samples_v2() from public, anon;
grant execute on function public.list_review_samples_v2() to authenticated;
revoke all on function public.load_review_sample_v2(uuid) from public, anon;
grant execute on function public.load_review_sample_v2(uuid) to authenticated;
revoke all on function public.register_deep_verify_video_v2(text,public.radar_storefront,text,text,text,text,text,text,bigint,numeric) from public, anon;
grant execute on function public.register_deep_verify_video_v2(text,public.radar_storefront,text,text,text,text,text,text,bigint,numeric) to authenticated;
revoke all on function public.register_deep_verify_video_with_session_v2(text,public.radar_storefront,text,text,text,text,text,text,bigint,numeric,text,text[],text[],text[],timestamptz) from public, anon;
grant execute on function public.register_deep_verify_video_with_session_v2(text,public.radar_storefront,text,text,text,text,text,text,bigint,numeric,text,text[],text[],text[],timestamptz) to authenticated;
revoke all on function public.list_deep_verify_videos_v2() from public, anon;
grant execute on function public.list_deep_verify_videos_v2() to authenticated;
revoke all on function public.load_deep_verify_video_v2(uuid) from public, anon;
grant execute on function public.load_deep_verify_video_v2(uuid) to authenticated;
