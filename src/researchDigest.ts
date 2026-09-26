import { z } from 'zod';

const ResearchChangeSchema = z.object({
  type: z.string().min(3),
  appId: z.string().min(5),
  name: z.string().min(1),
  significance: z.enum(['info', 'attention']),
  previous: z.number().optional(),
  current: z.number().optional(),
  delta: z.number().optional(),
  evidence: z.array(z.string()).min(1),
});

const ResearchStateSchema = z.object({
  appId: z.string().min(5),
  name: z.string().min(1),
  queueRank: z.number().int().positive(),
  researchPriority: z.number().int().min(0).max(100),
  state: z.enum(['INSUFFICIENT_HISTORY', 'PERSISTING_3D', 'PERSISTING_7D', 'RISING_EXACT_3D', 'FALLING_EXACT_3D', 'FLAT_EXACT_3D']),
  evidence: z.string().min(10),
});

export const ResearchDigestSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  currentDate: z.string(),
  comparisonDate: z.string(),
  status: z.enum(['complete', 'history_pending']),
  statement: z.string(),
  summary: z.object({
    currentCandidateCount: z.number().int().nonnegative(),
    changeCount: z.number().int().nonnegative(),
    attentionCount: z.number().int().nonnegative(),
    newCandidates: z.number().int().nonnegative(),
    droppedCandidates: z.number().int().nonnegative(),
    marketChanges: z.number().int().nonnegative(),
    maturityEvents: z.number().int().nonnegative(),
  }),
  limitations: z.array(z.string()).min(3),
  changes: z.array(ResearchChangeSchema),
  states: z.array(ResearchStateSchema),
});

export type ResearchDigest = z.infer<typeof ResearchDigestSchema>;

export async function loadResearchDigest(): Promise<ResearchDigest> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/research/digest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Research digest request failed (${response.status}).`);
  return ResearchDigestSchema.parse(await response.json());
}
