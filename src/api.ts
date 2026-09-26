import {
  AnalysisResultSchema,
  CandidateSearchResultSchema,
  GameInputSchema,
  type AnalysisResult,
  type CandidateSearchResult,
} from './domain';
import type { DecisionResult, Scorecard } from './decision';
import {
  CompetitorMapPayloadSchema,
  type CompetitorMapPayload,
  type DifferentiationMap,
  type RelationshipType,
} from './competitor';
import {
  SavedDossierPayloadSchema,
  SavedDossierSummaryRowSchema,
  SavedDossierSummarySchema,
  type SavedDossierPayload,
  type SavedDossierSummary,
} from './saved';
import {
  SavedReviewPayloadSchema,
  SavedReviewSummaryRowSchema,
  SavedReviewSummarySchema,
  type ReviewSampleAnalysis,
  type SavedReviewPayload,
  type SavedReviewSummary,
} from './reviews';
import { hasSupabaseConfig, supabase } from './lib/supabase';

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

export function isDirectAppleInput(input: string) {
  const value = input.trim();
  return /^\d{5,}$/.test(value) || /apps\.apple\.com\/.*\/id\d{5,}/i.test(value);
}

export async function searchGameCandidates(input: string): Promise<CandidateSearchResult> {
  const parsedInput = GameInputSchema.parse(input);
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('analyze-game', { body: { input: parsedInput, mode: 'search' } });
  if (error) throw error;
  return CandidateSearchResultSchema.parse(data);
}

export async function analyzeGame(input: string): Promise<AnalysisResult> {
  const parsedInput = GameInputSchema.parse(input);
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('analyze-game', { body: { input: parsedInput, mode: 'analyze' } });
  if (error) throw error;
  return AnalysisResultSchema.parse(data);
}

export async function saveDossier(result: AnalysisResult, scorecard: Scorecard, decision: DecisionResult): Promise<string> {
  const client = await requireOwner();
  const { data, error } = await client.rpc('save_dossier', { p_dossier: result, p_scorecard: scorecard, p_decision: decision });
  if (error) throw error;
  if (typeof data !== 'string' || data.length < 10) throw new Error('The dossier save completed without a valid analysis run ID.');
  return data;
}

export async function listSavedDossiers(): Promise<SavedDossierSummary[]> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return [];
  const { data, error } = await client.rpc('list_saved_dossiers');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = SavedDossierSummaryRowSchema.parse(raw);
    return SavedDossierSummarySchema.parse({
      runId: row.run_id,
      gameId: row.game_id,
      canonicalName: row.canonical_name,
      publisher: row.publisher,
      platform: row.platform,
      storeId: row.store_id,
      decisionStatus: row.decision_status,
      reviewedCount: row.reviewed_count,
      findingCount: row.finding_count,
      savedAt: row.saved_at,
    });
  });
}

export async function loadSavedDossier(runId: string): Promise<SavedDossierPayload> {
  const client = await requireOwner();
  const parsedRunId = SavedDossierSummarySchema.shape.runId.parse(runId);
  const { data, error } = await client.rpc('load_saved_dossier', { p_run_id: parsedRunId });
  if (error) throw error;
  if (!data) throw new Error('Saved dossier was not found or is not accessible to this owner.');
  return SavedDossierPayloadSchema.parse(data);
}

export async function saveCompetitorMap(
  primary: AnalysisResult,
  competitors: Array<{ analysis: AnalysisResult; relationship: RelationshipType; differentiation: DifferentiationMap }>,
): Promise<number> {
  const client = await requireOwner();
  const { data, error } = await client.rpc('save_competitor_map', {
    p_primary: primary,
    p_competitors: competitors,
  });
  if (error) throw error;
  if (typeof data !== 'number') throw new Error('Competitor map save returned an invalid result.');
  return data;
}

export async function loadCompetitorMap(primaryStoreId: string): Promise<CompetitorMapPayload | null> {
  const client = await requireOwner();
  const { data, error } = await client.rpc('load_competitor_map', { p_primary_store_id: primaryStoreId });
  if (error) throw error;
  if (!data) return null;
  return CompetitorMapPayloadSchema.parse(data);
}

export async function saveReviewSample(
  label: string,
  storeId: string,
  analysis: ReviewSampleAnalysis,
): Promise<string> {
  const client = await requireOwner();
  const trimmedLabel = label.trim();
  if (!trimmedLabel) throw new Error('A sample label is required before saving.');
  const { data, error } = await client.rpc('save_review_sample', {
    p_label: trimmedLabel,
    p_store_id: storeId.trim() || null,
    p_entries: analysis.entries,
    p_clusters: analysis.clusters,
    p_analysis_method: analysis.analysisMethod,
  });
  if (error) throw error;
  if (typeof data !== 'string' || data.length < 10) throw new Error('Review sample save completed without a valid sample ID.');
  return data;
}

export async function listReviewSamples(): Promise<SavedReviewSummary[]> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return [];
  const { data, error } = await client.rpc('list_review_samples');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = SavedReviewSummaryRowSchema.parse(raw);
    return SavedReviewSummarySchema.parse({
      sampleId: row.sample_id,
      label: row.label,
      canonicalName: row.canonical_name,
      storeId: row.store_id,
      analysisMethod: row.analysis_method,
      entryCount: row.entry_count,
      createdAt: row.created_at,
    });
  });
}

export async function loadReviewSample(sampleId: string): Promise<SavedReviewPayload> {
  const client = await requireOwner();
  const parsedId = SavedReviewSummarySchema.shape.sampleId.parse(sampleId);
  const { data, error } = await client.rpc('load_review_sample', { p_sample_id: parsedId });
  if (error) throw error;
  if (!data) throw new Error('Saved review sample was not found or is not accessible to this owner.');
  return SavedReviewPayloadSchema.parse(data);
}
