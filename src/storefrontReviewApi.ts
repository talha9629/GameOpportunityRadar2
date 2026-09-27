import { hasSupabaseConfig, supabase } from './lib/supabase';
import {
  SavedReviewPayloadSchema,
  SavedReviewSummaryRowSchema,
  SavedReviewSummarySchema,
  type ReviewSampleAnalysis,
  type SavedReviewPayload,
  type SavedReviewSummary,
} from './reviews';
import { StorefrontSchema, type Storefront } from './storeIdentity';

function requireSupabase() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase is not configured yet. Connect the deployment to the Radar Supabase project first.');
  }
  return supabase;
}

async function requireOwner() {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error('Owner sign-in is required for this cloud action.');
  return client;
}

export async function saveStorefrontReviewSample(
  storefront: Storefront,
  label: string,
  storeId: string,
  analysis: ReviewSampleAnalysis,
): Promise<string> {
  const client = await requireOwner();
  const parsedStorefront = StorefrontSchema.parse(storefront);
  const trimmedLabel = label.trim();
  const trimmedStoreId = storeId.trim();
  if (!trimmedLabel) throw new Error('A sample label is required before saving.');
  const { data, error } = await client.rpc('save_review_sample_v2', {
    p_label: trimmedLabel,
    p_storefront: parsedStorefront,
    p_store_id: trimmedStoreId || null,
    p_entries: analysis.entries,
    p_clusters: analysis.clusters,
    p_analysis_method: analysis.analysisMethod,
  });
  if (error) throw error;
  if (typeof data !== 'string' || data.length < 10) throw new Error('Review sample save completed without a valid sample ID.');
  return data;
}

export async function listStorefrontReviewSamples(storefront: Storefront): Promise<SavedReviewSummary[]> {
  const client = requireSupabase();
  const parsedStorefront = StorefrontSchema.parse(storefront);
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return [];
  const { data, error } = await client.rpc('list_review_samples_v2');
  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .map((raw) => {
      const row = SavedReviewSummaryRowSchema.parse(raw);
      return SavedReviewSummarySchema.parse({
        sampleId: row.sample_id,
        label: row.label,
        canonicalName: row.canonical_name,
        storefront: row.storefront ?? null,
        storeId: row.store_id,
        analysisMethod: row.analysis_method,
        entryCount: row.entry_count,
        createdAt: row.created_at,
      });
    })
    .filter((sample) => sample.storefront === parsedStorefront);
}

export async function loadStorefrontReviewSample(
  storefront: Storefront,
  sampleId: string,
): Promise<SavedReviewPayload> {
  const client = await requireOwner();
  const parsedStorefront = StorefrontSchema.parse(storefront);
  const parsedId = SavedReviewSummarySchema.shape.sampleId.parse(sampleId);
  const { data, error } = await client.rpc('load_review_sample_v2', { p_sample_id: parsedId });
  if (error) throw error;
  if (!data) throw new Error('Saved review sample was not found or is not accessible to this owner.');
  const payload = SavedReviewPayloadSchema.parse(data);
  if (payload.storefront !== parsedStorefront) {
    throw new Error('Saved review sample belongs to a different storefront. Switch platforms before restoring it.');
  }
  return payload;
}
