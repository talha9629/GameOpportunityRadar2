import { hasSupabaseConfig, supabase } from './lib/supabase';
import {
  VerificationSessionEvidenceRowSchema,
  VerificationSessionEvidenceSchema,
  type VerificationSessionEvidence,
} from './verificationEvidence';

export async function listVerificationSessionEvidence(sessionIds: string[]): Promise<VerificationSessionEvidence[]> {
  if (!hasSupabaseConfig || !supabase) return [];

  const ids = [...new Set(sessionIds.filter((value) => /^[a-f0-9]{24}$/.test(value)))];
  if (ids.length === 0) return [];

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return [];

  const { data, error } = await supabase
    .from('deep_verify_videos')
    .select('id,label,store_id,source_type,status,verification_session_id,verification_task_ids,verification_research_generated_at,created_at')
    .in('verification_session_id', ids)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  return (data ?? []).map((raw) => {
    const row = VerificationSessionEvidenceRowSchema.parse(raw);
    return VerificationSessionEvidenceSchema.parse({
      videoId: row.id,
      label: row.label,
      storeId: row.store_id,
      sourceType: row.source_type,
      status: row.status,
      sessionId: row.verification_session_id,
      taskIds: row.verification_task_ids,
      researchGeneratedAt: row.verification_research_generated_at,
      createdAt: row.created_at,
    });
  });
}
