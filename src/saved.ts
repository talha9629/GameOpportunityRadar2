import { z } from 'zod';
import { AnalysisResultSchema } from './domain';

const ScoreValueSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.null()]);

export const SavedDossierSummaryRowSchema = z.object({
  run_id: z.string().uuid(),
  game_id: z.string().uuid(),
  canonical_name: z.string().min(1),
  publisher: z.string().nullable(),
  platform: z.enum(['ios', 'android']).nullable(),
  store_id: z.string().nullable(),
  decision_status: z.string().nullable(),
  reviewed_count: z.coerce.number().int().nonnegative(),
  finding_count: z.coerce.number().int().nonnegative(),
  saved_at: z.string().nullable(),
});

export const SavedDossierSummarySchema = z.object({
  runId: z.string().uuid(),
  gameId: z.string().uuid(),
  canonicalName: z.string().min(1),
  publisher: z.string().nullable(),
  platform: z.enum(['ios', 'android']).nullable(),
  storeId: z.string().nullable(),
  decisionStatus: z.string().nullable(),
  reviewedCount: z.number().int().nonnegative(),
  findingCount: z.number().int().nonnegative(),
  savedAt: z.string().nullable(),
});

export const SavedDossierPayloadSchema = z.object({
  runId: z.string().uuid(),
  savedAt: z.string().nullable(),
  dossier: AnalysisResultSchema,
  scorecard: z.object({
    momentum: ScoreValueSchema,
    soloFit: ScoreValueSchema,
    differentiation: ScoreValueSchema,
    saturation: ScoreValueSchema,
    risk: ScoreValueSchema,
    confidence: ScoreValueSchema,
    hardBlocks: z.array(z.string()),
  }),
  decision: z.object({
    status: z.enum(['PASS', 'TOO LATE', 'WATCH', 'VERIFY', 'PROTOTYPE']),
    reasons: z.array(z.string()),
  }),
});

export type SavedDossierSummary = z.infer<typeof SavedDossierSummarySchema>;
export type SavedDossierPayload = z.infer<typeof SavedDossierPayloadSchema>;
