import { z } from 'zod';

export const VerificationSessionEvidenceRowSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  store_id: z.string().nullable(),
  source_type: z.enum(['upload', 'youtube_url']),
  status: z.string().min(1),
  verification_session_id: z.string().regex(/^[a-f0-9]{24}$/),
  verification_task_ids: z.array(z.string().regex(/^[a-f0-9]{24}$/)).min(1).max(8),
  verification_research_generated_at: z.string(),
  created_at: z.string(),
});

export const VerificationSessionEvidenceSchema = z.object({
  videoId: z.string().uuid(),
  label: z.string().min(1),
  storeId: z.string().nullable(),
  sourceType: z.enum(['upload', 'youtube_url']),
  status: z.string().min(1),
  sessionId: z.string().regex(/^[a-f0-9]{24}$/),
  taskIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)).min(1).max(8),
  researchGeneratedAt: z.string(),
  createdAt: z.string(),
});

export type VerificationSessionEvidence = z.infer<typeof VerificationSessionEvidenceSchema>;

export function latestEvidenceForSession(
  evidence: VerificationSessionEvidence[],
  sessionId: string,
): VerificationSessionEvidence | null {
  const matches = evidence
    .filter((item) => item.sessionId === sessionId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return matches[0] ?? null;
}

export function evidenceCountForSession(evidence: VerificationSessionEvidence[], sessionId: string) {
  return evidence.filter((item) => item.sessionId === sessionId).length;
}
