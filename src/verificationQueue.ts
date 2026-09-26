import { z } from 'zod';

export const VerificationTaskSchema = z.object({
  verificationOrder: z.number().int().positive(),
  taskId: z.string().regex(/^[a-f0-9]{24}$/),
  appId: z.string().min(5),
  name: z.string().min(1),
  queueRank: z.number().int().positive(),
  researchPriority: z.number().int().min(0).max(100),
  unknown: z.string().min(15),
  category: z.enum([
    'gameplay_mechanic',
    'monetization_placement',
    'meta_progression',
    'competitor_relationship',
    'market_history',
    'performance_estimate',
    'other_unknown',
  ]),
  evidenceType: z.enum(['deep_verify_video', 'competitor_map', 'exact_rank_history', 'third_party_estimate', 'manual_evidence']),
  evidenceMode: z.string().min(3),
  impact: z.enum(['critical', 'high', 'medium', 'low']),
  automationState: z.enum(['ready_for_human_evidence', 'ready_for_human_review', 'auto_waiting', 'optional_external']),
  actionLabel: z.string().min(3),
  why: z.string().min(30),
  source: z.object({
    researchGeneratedAt: z.string(),
    analysisObservedAt: z.string().nullable(),
    sourceOrigin: z.string(),
    sourceMode: z.string(),
  }),
});

export const VerificationCaptureSessionSchema = z.object({
  sessionOrder: z.number().int().positive(),
  sessionId: z.string().regex(/^[a-f0-9]{24}$/),
  appId: z.string().min(5),
  name: z.string().min(1),
  queueRank: z.number().int().positive(),
  researchPriority: z.number().int().min(0).max(100),
  evidenceType: z.literal('deep_verify_video'),
  evidenceMode: z.literal('user_capture_or_public_youtube'),
  automationState: z.literal('ready_for_human_evidence'),
  impact: z.enum(['critical', 'high']),
  actionLabel: z.string().min(3),
  why: z.string().min(30),
  taskCount: z.number().int().positive(),
  taskIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)).min(1),
  unknowns: z.array(z.string().min(15)).min(1),
  categories: z.array(z.enum(['gameplay_mechanic', 'monetization_placement', 'meta_progression', 'other_unknown'])).min(1),
  source: z.object({
    researchGeneratedAt: z.string(),
    analysisObservedAt: z.string().nullable(),
  }),
});

export const VerificationQueueSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  researchGeneratedAt: z.string(),
  radarDate: z.string(),
  statement: z.string().min(40),
  method: z.object({
    name: z.literal('explicit_unknown_evidence_router_v1'),
    candidateCap: z.number().int().positive().max(8),
    taskCap: z.number().int().positive().max(64),
    ordering: z.array(z.string()).min(2),
    sessionGrouping: z.object({
      name: z.literal('candidate_deep_verify_capture_session_v1'),
      rule: z.string().min(30),
    }),
    prohibitedShortcuts: z.array(z.string()).min(4),
  }),
  summary: z.object({
    candidateCount: z.number().int().nonnegative().max(8),
    rawTaskCount: z.number().int().nonnegative().max(64),
    taskCount: z.number().int().nonnegative().max(64),
    omittedTaskCount: z.number().int().nonnegative().max(64),
    readyForHumanEvidence: z.number().int().nonnegative(),
    readyForHumanReview: z.number().int().nonnegative(),
    autoWaiting: z.number().int().nonnegative(),
    optionalExternal: z.number().int().nonnegative(),
    captureSessionCount: z.number().int().nonnegative().max(8),
    groupedEvidenceTaskCount: z.number().int().nonnegative().max(64),
  }),
  captureSessions: z.array(VerificationCaptureSessionSchema).max(8),
  tasks: z.array(VerificationTaskSchema).max(64),
});

export type VerificationTask = z.infer<typeof VerificationTaskSchema>;
export type VerificationCaptureSession = z.infer<typeof VerificationCaptureSessionSchema>;
export type VerificationQueue = z.infer<typeof VerificationQueueSchema>;

export async function loadVerificationQueue(): Promise<VerificationQueue> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/verification/latest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Verification queue request failed (${response.status}).`);
  return VerificationQueueSchema.parse(await response.json());
}
