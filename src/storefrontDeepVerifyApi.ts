import {
  DEEP_VERIFY_BUCKET,
  DeepVerifyVerificationSessionSchema,
  DeepVerifyVideoPayloadSchema,
  DeepVerifyVideoSummaryRowSchema,
  DeepVerifyVideoSummarySchema,
  normalizeYoutubeUrl,
  sanitizeEvidenceFileName,
  validateUploadEvidence,
  type DeepVerifyVerificationSession,
  type DeepVerifyVideoPayload,
  type DeepVerifyVideoSummary,
} from './deepVerify';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import { StorefrontSchema, type Storefront } from './storeIdentity';

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

function verificationRegistrationArgs(storefront: Storefront, session: DeepVerifyVerificationSession | null) {
  if (!session) return null;
  if (storefront !== 'apple_app_store') {
    throw new Error('Generated verification sessions are currently Apple-only. Use manual Deep Verify for this storefront.');
  }
  const parsed = DeepVerifyVerificationSessionSchema.parse(session);
  return {
    p_verification_session_id: parsed.sessionId,
    p_verification_task_ids: parsed.taskIds,
    p_verification_unknowns: parsed.unknowns,
    p_verification_categories: parsed.categories,
    p_verification_research_generated_at: parsed.researchGeneratedAt,
  };
}

function baseRegistrationArgs(storefront: Storefront, label: string, storeId: string) {
  const parsedStorefront = StorefrontSchema.parse(storefront);
  const trimmedLabel = label.trim();
  const trimmedStoreId = storeId.trim();
  if (!trimmedLabel) throw new Error('An evidence label is required before saving.');
  return {
    p_label: trimmedLabel,
    p_storefront: parsedStorefront,
    p_store_id: trimmedStoreId || null,
  };
}

export async function uploadStorefrontDeepVerifyVideo(
  storefront: Storefront,
  label: string,
  storeId: string,
  file: File,
  durationSeconds: number,
  verificationSession: DeepVerifyVerificationSession | null = null,
): Promise<string> {
  const { client, user } = await requireOwnerContext();
  validateUploadEvidence({ sizeBytes: file.size, mimeType: file.type, durationSeconds });
  const base = baseRegistrationArgs(storefront, label, storeId);
  const sessionArgs = verificationRegistrationArgs(storefront, verificationSession);
  const storagePath = `${user.id}/${crypto.randomUUID()}/${sanitizeEvidenceFileName(file.name)}`;

  const { error: uploadError } = await client.storage.from(DEEP_VERIFY_BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  try {
    const sourceArgs = {
      ...base,
      p_source_type: 'upload',
      p_storage_path: storagePath,
      p_external_url: null,
      p_original_name: file.name,
      p_mime_type: file.type,
      p_size_bytes: file.size,
      p_duration_seconds: durationSeconds,
    };
    const { data, error } = sessionArgs
      ? await client.rpc('register_deep_verify_video_with_session_v2', { ...sourceArgs, ...sessionArgs })
      : await client.rpc('register_deep_verify_video_v2', sourceArgs);
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

export async function registerStorefrontDeepVerifyYoutube(
  storefront: Storefront,
  label: string,
  storeId: string,
  url: string,
  verificationSession: DeepVerifyVerificationSession | null = null,
): Promise<string> {
  const { client } = await requireOwnerContext();
  const base = baseRegistrationArgs(storefront, label, storeId);
  const sessionArgs = verificationRegistrationArgs(storefront, verificationSession);
  const sourceArgs = {
    ...base,
    p_source_type: 'youtube_url',
    p_storage_path: null,
    p_external_url: normalizeYoutubeUrl(url),
    p_original_name: null,
    p_mime_type: null,
    p_size_bytes: null,
    p_duration_seconds: null,
  };
  const { data, error } = sessionArgs
    ? await client.rpc('register_deep_verify_video_with_session_v2', { ...sourceArgs, ...sessionArgs })
    : await client.rpc('register_deep_verify_video_v2', sourceArgs);
  if (error) throw error;
  if (typeof data !== 'string' || data.length < 10) throw new Error('Deep Verify registration returned an invalid evidence ID.');
  return data;
}

export async function listStorefrontDeepVerifyVideos(storefront: Storefront): Promise<DeepVerifyVideoSummary[]> {
  const client = requireSupabase();
  const parsedStorefront = StorefrontSchema.parse(storefront);
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return [];
  const { data, error } = await client.rpc('list_deep_verify_videos_v2');
  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .map((raw) => {
      const row = DeepVerifyVideoSummaryRowSchema.parse(raw);
      return DeepVerifyVideoSummarySchema.parse({
        videoId: row.video_id,
        label: row.label,
        canonicalName: row.canonical_name,
        storefront: row.storefront ?? null,
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
    })
    .filter((video) => video.storefront === parsedStorefront);
}

export async function loadStorefrontDeepVerifyVideo(
  storefront: Storefront,
  videoId: string,
): Promise<DeepVerifyVideoPayload> {
  const { client } = await requireOwnerContext();
  const parsedStorefront = StorefrontSchema.parse(storefront);
  const parsedId = DeepVerifyVideoSummarySchema.shape.videoId.parse(videoId);
  const { data, error } = await client.rpc('load_deep_verify_video_v2', { p_video_id: parsedId });
  if (error) throw error;
  if (!data) throw new Error('Deep Verify evidence was not found or is not accessible to this owner.');
  const payload = DeepVerifyVideoPayloadSchema.parse(data);
  if (payload.storefront !== parsedStorefront) {
    throw new Error('Deep Verify evidence belongs to a different storefront. Switch platforms before opening it.');
  }
  if (payload.verificationSession && parsedStorefront !== 'apple_app_store') {
    throw new Error('Generated verification-session evidence is currently Apple-only.');
  }
  return payload;
}
