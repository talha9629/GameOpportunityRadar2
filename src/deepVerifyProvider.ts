import { z } from 'zod';
import { listDeepVerifyVideos, loadDeepVerifyVideo } from './api';
import { DEEP_VERIFY_BUCKET, type DeepVerifyVideoPayload } from './deepVerify';
import { hasSupabaseConfig, supabase } from './lib/supabase';

const DeepVerifyAnalysisResultSchema = z.object({
  ok: z.literal(true),
  videoId: z.string().uuid(),
  runId: z.string().uuid(),
  model: z.string().min(1),
  summary: z.string().min(1),
  unknowns: z.array(z.string()),
  eventCount: z.coerce.number().int().nonnegative(),
  estimatedCostUsd: z.coerce.number().nonnegative(),
  deletionEligibleAt: z.string().nullable(),
});

export type DeepVerifyAnalysisResult = z.infer<typeof DeepVerifyAnalysisResultSchema>;

function requireClient() {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

async function functionErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { message?: unknown; error?: unknown };
        if (typeof body.message === 'string') return body.message;
        if (typeof body.error === 'string') return body.error;
      } catch { /* use generic error below */ }
    }
  }
  return error instanceof Error ? error.message : 'Deep Verify analysis failed.';
}

export async function runDeepVerifyAnalysis(videoId: string): Promise<DeepVerifyAnalysisResult> {
  const client = requireClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error('Owner sign-in is required to run Deep Verify analysis.');
  const { data, error } = await client.functions.invoke('deep-verify-analyze', { body: { videoId } });
  if (error) throw new Error(await functionErrorMessage(error));
  return DeepVerifyAnalysisResultSchema.parse(data);
}

export async function expireDeepVerifySource(video: DeepVerifyVideoPayload): Promise<void> {
  if (video.sourceType !== 'upload' || video.sourceDeletedAt || !video.storagePath) return;
  const client = requireClient();
  const { error: removeError } = await client.storage.from(DEEP_VERIFY_BUCKET).remove([video.storagePath]);
  if (removeError) throw removeError;
  const { error: markError } = await client.rpc('mark_deep_verify_source_deleted', { p_video_id: video.videoId });
  if (markError) throw markError;
}

export async function purgeExpiredDeepVerifySources(): Promise<number> {
  const client = requireClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return 0;
  const now = Date.now();
  const expired = (await listDeepVerifyVideos()).filter((item) =>
    item.sourceType === 'upload'
    && item.deleteAfter != null
    && Date.parse(item.deleteAfter) <= now,
  );
  let removed = 0;
  for (const item of expired) {
    const payload = await loadDeepVerifyVideo(item.videoId);
    if (payload.sourceDeletedAt || !payload.storagePath) continue;
    await expireDeepVerifySource(payload);
    removed += 1;
  }
  return removed;
}
