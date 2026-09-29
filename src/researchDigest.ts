import { z } from 'zod';

const ResearchChangeSchema = z.object({
  type: z.string().min(3),
  appId: z.string().min(5),
  name: z.string().min(1),
  iconUrl: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  previousQueueRank: z.number().int().positive().nullable().optional(),
  currentQueueRank: z.number().int().positive().nullable().optional(),
  previousBestRank: z.number().int().positive().nullable().optional(),
  currentBestRank: z.number().int().positive().nullable().optional(),
  previousMarketCount: z.number().int().nonnegative().nullable().optional(),
  currentMarketCount: z.number().int().nonnegative().nullable().optional(),
  significance: z.enum(['info', 'attention']),
  previous: z.number().optional(),
  current: z.number().optional(),
  delta: z.number().optional(),
  reasonCodesAdded: z.array(z.string()).optional(),
  reasonCodesRemoved: z.array(z.string()).optional(),
  evidence: z.array(z.string()).min(1),
});

const ExactWindowStatusSchema = z.enum([
  'available',
  'history_missing',
  'not_ranked',
  'market_failed',
  'source_mismatch',
  'coverage_gap',
]);

const ResearchTrendStateSchema = z.enum(['INSUFFICIENT_DATA', 'EMERGING', 'RISING', 'ESTABLISHED', 'DECLINING']);

const DigestCandidateSnapshotSchema = z.object({
  appId: z.string().min(5),
  name: z.string().min(1),
  iconUrl: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  queueRank: z.number().int().positive(),
  researchPriority: z.number().int().min(0).max(100),
  trendState: ResearchTrendStateSchema,
  trendRationale: z.array(z.string()),
  consecutiveHistoryDays: z.number().int().nonnegative().nullable(),
  minimumConsecutiveHistoryDays: z.number().int().positive().nullable(),
  observedPersistenceDays: z.number().int().nonnegative(),
  exact3dMovement: z.object({
    status: ExactWindowStatusSchema,
    bestUpwardDelta: z.number().int().nullable(),
  }),
});

export const ResearchDigestSchema = z.object({
  schemaVersion: z.literal(2),
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
    comparisonAvailabilityEvents: z.number().int().nonnegative(),
  }),
  limitations: z.array(z.string()).min(4),
  changes: z.array(ResearchChangeSchema),
  candidateSnapshots: z.array(DigestCandidateSnapshotSchema),
});

export type ResearchDigest = z.infer<typeof ResearchDigestSchema>;
export type ResearchChange = z.infer<typeof ResearchChangeSchema>;

export async function loadResearchDigest(): Promise<ResearchDigest> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/research/digest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Research digest request failed (${response.status}).`);
  return ResearchDigestSchema.parse(await response.json());
}
