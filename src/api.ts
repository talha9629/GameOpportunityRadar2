import {
  AnalysisResultSchema,
  CandidateSearchResultSchema,
  GameInputSchema,
  ReviewStateSchema,
  type AnalysisResult,
  type CandidateSearchResult,
  type ReviewState,
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
import {
  DEEP_VERIFY_BUCKET,
  DeepVerifyEventDraftSchema,
  DeepVerifyVerificationSessionSchema,
  DeepVerifyVideoPayloadSchema,
  DeepVerifyVideoSummaryRowSchema,
  DeepVerifyVideoSummarySchema,
  normalizeYoutubeUrl,
  sanitizeEvidenceFileName,
  validateUploadEvidence,
  type DeepVerifyEventDraft,
  type DeepVerifyVerificationSession,
  type DeepVerifyVideoPayload,
  type DeepVerifyVideoSummary,
} from './deepVerify';
import { hasSupabaseConfig, supabase } from './lib/supabase';

function requireSupabase() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase is not configured yet. Connect the deployment to the Radar Supabase project first.');
  }
  return supabase;
}

async function requireOwnerContext() {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error('Owner sign-in is required for this cloud action.');
  return { client, user: userData.user };
}

async function requireOwner() {
  const { client } = await requireOwnerContext();
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

function verificationRegistrationArgs(session: DeepVerifyVerificationSession) {
  const parsed = DeepVerifyVerificationSessionSchema.parse(session);
  return {
    p_verification_session_id: parsed.sessionId,
    p_verification_task_ids: parsed.taskIds,
    p_verification_unknowns: parsed.unknowns,
    p_verification_categories: parsed.categories,
    p_verification_research_generated_at: parsed.researchGeneratedAt,
  };
}

export async function uploadDeepVerifyVideo(
  label: string,
  storeId: string,
  file: File,
  durationSeconds: number,
  verificationSession: DeepVerifyVerificationSession | null = null,
): Promise<string> {
  const { client, user } = await requireOwnerContext();
  const trimmedLabel = label.trim();
  if (!trimmedLabel) throw new Error('An evidence label is required before uploading.');
  validateUploadEvidence({ sizeBytes: file.size, mimeType: file.type, durationSeconds });

  const storagePath = `${user.id}/${crypto.randomUUID()}/${sanitizeEvidenceFileName(file.name)}`;
  const { error: uploadError } = await client.storage.from(DEEP_VERIFY_BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  try {
    const baseArgs = {
      p_label: trimmedLabel,
      p_store_id: storeId.trim() || null,
      p_source_type: 'upload',
      p_storage_path: storagePath,
      p_external_url: null,
      p_original_name: file.name,
      p_mime_type: file.type,
      p_size_bytes: file.size,
      p_duration_seconds: durationSeconds,
    };
    const { data, error } = verificationSession
      ? await client.rpc('register_deep_verify_video_with_session', {
          ...baseArgs,
          ...verificationRegistrationArgs(verificationSession),
        })
      : await client.rpc('register_deep_verify_video', baseArgs);
    if (error) throw error;
    if (typeof data !== 'string' || data.length < 10) throw new Error('Deep Verify registration returned an invalid evidence ID.');
    return data;
  } catch (error) {
    const cleanup = await client.storage.from(DEEP_VERIFY_BUCKET).remove([storagePath]);
    if (cleanup.error) {
      throw new Error(`Evidence registration failed and uploaded-file cleanup also failed: ${cleanup.error.message}`);
    }
    throw error;
  }
}

export async function registerDeepVerifyYoutube(
  label: string,
  storeId: string,
  url: string,
  verificationSession: DeepVerifyVerificationSession | null = null,
): Promise<string> {
  const client = await requireOwner();
  const trimmedLabel = label.trim();
  if (!trimmedLabel) throw new Error('An evidence label is required before saving.');
  const normalizedUrl = normalizeYoutubeUrl(url);
  const baseArgs = {
    p_label: trimmedLabel,
    p_store_id: storeId.trim() || null,
    p_source_type: 'youtube_url',
    p_storage_path: null,
    p_external_url: normalizedUrl,
    p_original_name: null,
    p_mime_type: null,
    p_size_bytes: null,
    p_duration_seconds: null,
  };
  const { data, error } = verificationSession
    ? await client.rpc('register_deep_verify_video_with_session', {
        ...baseArgs,
        ...verificationRegistrationArgs(verificationSession),
      })
    : await client.rpc('register_deep_verify_video', baseArgs);
  if (error) throw error;
  if (typeof data !== 'string' || data.length < 10) throw new Error('Deep Verify registration returned an invalid evidence ID.');
  return data;
}

export async function listDeepVerifyVideos(): Promise<DeepVerifyVideoSummary[]> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return [];
  const { data, error } = await client.rpc('list_deep_verify_videos');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = DeepVerifyVideoSummaryRowSchema.parse(raw);
    return DeepVerifyVideoSummarySchema.parse({
      videoId: row.video_id,
      label: row.label,
      canonicalName: row.canonical_name,
      storeId: row.store_id,
      sourceType: row.source_type,
      status: row.status,
      provider: row.provider,
      model: row.model,
      originalName: row.original_name,
      sizeBytes: row.size_bytes,
      durationSeconds: row.duration_seconds,
      deleteAfter: row.delete_after,
      sourceDeletedAt: row.source_deleted_at ?? null,
      createdAt: row.created_at,
      eventCount: row.event_count,
    });
  });
}

export async function loadDeepVerifyVideo(videoId: string): Promise<DeepVerifyVideoPayload> {
  const client = await requireOwner();
  const parsedId = DeepVerifyVideoSummarySchema.shape.videoId.parse(videoId);
  const { data, error } = await client.rpc('load_deep_verify_video', { p_video_id: parsedId });
  if (error) throw error;
  if (!data) throw new Error('Deep Verify evidence was not found or is not accessible to this owner.');
  return DeepVerifyVideoPayloadSchema.parse(data);
}

export async function createDeepVerifyPreviewUrl(storagePath: string): Promise<string> {
  const client = await requireOwner();
  const path = storagePath.trim();
  if (!path) throw new Error('This evidence record has no uploaded storage path.');
  const { data, error } = await client.storage.from(DEEP_VERIFY_BUCKET).createSignedUrl(path, 15 * 60);
  if (error) throw error;
  if (!data.signedUrl) throw new Error('Could not create a temporary private preview URL.');
  return data.signedUrl;
}

export async function addDeepVerifyEvent(videoId: string, draft: DeepVerifyEventDraft): Promise<string> {
  const client = await requireOwner();
  const parsedVideoId = DeepVerifyVideoSummarySchema.shape.videoId.parse(videoId);
  const parsed = DeepVerifyEventDraftSchema.parse(draft);
  const { data, error } = await client.from('deep_verify_events').insert({
    video_id: parsedVideoId,
    event_key: parsed.eventKey,
    label: parsed.label,
    claim: parsed.claim,
    start_seconds: parsed.startSeconds,
    end_seconds: parsed.endSeconds,
    origin: parsed.origin,
    interpretation: parsed.interpretation,
    coverage: parsed.coverage,
    review_state: 'unreviewed',
    confidence: parsed.confidence,
    evidence_note: parsed.evidenceNote,
  }).select('id').single();
  if (error) throw error;
  if (!data?.id) throw new Error('Timestamped evidence save returned no event ID.');
  return String(data.id);
}

export async function reviewDeepVerifyEvent(eventId: string, state: ReviewState): Promise<void> {
  const client = await requireOwner();
  const parsedState = ReviewStateSchema.parse(state);
  const { error } = await client.from('deep_verify_events').update({
    review_state: parsedState,
    reviewed_at: parsedState === 'unreviewed' ? null : new Date().toISOString(),
  }).eq('id', eventId);
  if (error) throw error;
}

export async function deleteDeepVerifyEvent(eventId: string): Promise<void> {
  const client = await requireOwner();
  const { error } = await client.from('deep_verify_events').delete().eq('id', eventId);
  if (error) throw error;
}

export async function deleteDeepVerifyVideo(video: DeepVerifyVideoPayload): Promise<void> {
  const client = await requireOwner();
  if (video.sourceType === 'upload' && video.storagePath) {
    const { error: storageError } = await client.storage.from(DEEP_VERIFY_BUCKET).remove([video.storagePath]);
    if (storageError) throw storageError;
  }
  const { error } = await client.from('deep_verify_videos').delete().eq('id', video.videoId);
  if (error) throw error;
}
