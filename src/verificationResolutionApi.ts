import { hasSupabaseConfig, supabase } from './lib/supabase';
import {
  VerificationResolutionCategorySchema,
  VerificationTaskResolutionRowSchema,
  VerificationTaskResolutionSchema,
  type VerificationResolutionCategory,
  type VerificationTaskResolution,
} from './verificationResolution';

function toResolution(raw: unknown): VerificationTaskResolution {
  const row = VerificationTaskResolutionRowSchema.parse(raw);
  return VerificationTaskResolutionSchema.parse({
    resolutionId: row.id,
    taskId: row.task_id,
    sessionId: row.session_id,
    sourceVideoId: row.source_video_id,
    sourceEventId: row.source_event_id,
    unknownSnapshot: row.unknown_snapshot,
    category: row.category,
    researchGeneratedAt: row.research_generated_at,
    state: row.resolution_state,
    summary: row.resolution_summary,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function requireOwnerClient() {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase is not configured yet.');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Owner sign-in is required for verification task review.');
  return { client: supabase, userId: data.user.id };
}

export async function listVerificationTaskResolutions(taskIds: string[]): Promise<VerificationTaskResolution[]> {
  if (!hasSupabaseConfig || !supabase) return [];
  const ids = [...new Set(taskIds.filter((value) => /^[a-f0-9]{24}$/.test(value)))];
  if (ids.length === 0) return [];
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return [];

  const { data, error } = await supabase
    .from('verification_task_resolutions')
    .select('id,owner_id,task_id,session_id,source_video_id,source_event_id,unknown_snapshot,category,research_generated_at,resolution_state,resolution_summary,resolved_at,created_at,updated_at')
    .in('task_id', ids)
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(toResolution);
}

export async function saveVerificationTaskResolution(input: {
  taskId: string;
  sessionId: string;
  sourceVideoId: string;
  sourceEventId: string | null;
  unknownSnapshot: string;
  category: VerificationResolutionCategory;
  researchGeneratedAt: string;
  state: 'resolved' | 'needs_more_evidence';
  summary: string;
}): Promise<VerificationTaskResolution> {
  const { client, userId } = await requireOwnerClient();
  const category = VerificationResolutionCategorySchema.parse(input.category);
  const now = new Date().toISOString();
  const row = {
    owner_id: userId,
    task_id: input.taskId,
    session_id: input.sessionId,
    source_video_id: input.sourceVideoId,
    source_event_id: input.state === 'resolved' ? input.sourceEventId : null,
    unknown_snapshot: input.unknownSnapshot,
    category,
    research_generated_at: input.researchGeneratedAt,
    resolution_state: input.state,
    resolution_summary: input.summary,
    resolved_at: input.state === 'resolved' ? now : null,
    updated_at: now,
  };

  const { data, error } = await client
    .from('verification_task_resolutions')
    .upsert(row, { onConflict: 'owner_id,task_id' })
    .select('id,owner_id,task_id,session_id,source_video_id,source_event_id,unknown_snapshot,category,research_generated_at,resolution_state,resolution_summary,resolved_at,created_at,updated_at')
    .single();
  if (error) throw error;
  return toResolution(data);
}
