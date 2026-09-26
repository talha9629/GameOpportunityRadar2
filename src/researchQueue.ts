import { z } from 'zod';

const WindowSignalSchema = z.object({
  days: z.number().int().positive(),
  status: z.enum(['available', 'history_missing', 'market_failed', 'not_ranked']),
  bestUpwardDelta: z.number().int().nullable(),
  perMarket: z.array(z.object({
    market: z.string(),
    days: z.number().int().positive(),
    targetDate: z.string(),
    status: z.enum(['available', 'history_missing', 'market_failed', 'not_ranked']),
    priorRank: z.number().int().positive().nullable(),
    currentRank: z.number().int().positive().nullable(),
    delta: z.number().int().nullable(),
  })),
});

const AppleMetadataSchema = z.object({
  sourceOrigin: z.literal('official_public'),
  interpretation: z.literal('direct'),
  observedAt: z.string(),
  country: z.string(),
  sourceUrl: z.string(),
  canonicalName: z.string().nullable(),
  publisher: z.string().nullable(),
  primaryGenreName: z.string().nullable(),
  genres: z.array(z.string()),
  rating: z.number().nullable(),
  ratingCount: z.number().int().nonnegative().nullable(),
  releaseDate: z.string().nullable(),
  currentVersionReleaseDate: z.string().nullable(),
  version: z.string().nullable(),
  contentAdvisoryRating: z.string().nullable(),
  minimumOsVersion: z.string().nullable(),
  releaseAgeDays: z.number().int().nonnegative().nullable(),
  versionAgeDays: z.number().int().nonnegative().nullable(),
});

const AppBrainEstimateSchema = z.object({
  sourceOrigin: z.literal('third_party_estimate'),
  interpretation: z.literal('direct_provider_value'),
  provider: z.literal('AppBrain'),
  observedAt: z.string(),
  package: z.string(),
  estimatedDownloads: z.number().int().nonnegative().nullable(),
  estimatedRecentDownloads: z.number().int().nonnegative().nullable(),
  downloadsCategory: z.string().nullable(),
  rating: z.number().nullable(),
  ratingCount: z.number().int().nonnegative().nullable(),
  infoRefreshTime: z.union([z.string(), z.number()]).nullable(),
});

export const ResearchCandidateSchema = z.object({
  queueRank: z.number().int().positive(),
  appId: z.string().min(5),
  name: z.string().min(1),
  publisher: z.string(),
  iconUrl: z.string().nullable(),
  storeUrl: z.string().nullable(),
  researchPriority: z.number().int().min(0).max(100),
  priorityMeaning: z.string().min(20),
  reasonCodes: z.array(z.string()).min(1),
  evidence: z.object({
    sourceOrigin: z.literal('official_public'),
    chartCategory: z.literal('Games'),
    marketCount: z.number().int().min(1).max(4),
    bestRank: z.number().int().min(1).max(50),
    averageRank: z.number().positive(),
    maxObservedDays: z.number().int().positive(),
    newEntry: z.boolean(),
    markets: z.array(z.object({
      country: z.string(),
      market: z.string(),
      rank: z.number().int().positive(),
      priorRank: z.number().int().positive().nullable(),
      delta: z.number().int().nullable(),
      daysObserved: z.number().int().positive(),
      bestObservedRank: z.number().int().positive(),
      newEntry: z.boolean(),
      sourceMode: z.string().nullable(),
      observedAt: z.string(),
    })),
    exactWindows: z.object({
      '1d': WindowSignalSchema,
      '3d': WindowSignalSchema,
      '7d': WindowSignalSchema,
    }),
  }),
  appleMetadata: AppleMetadataSchema.nullable(),
  appBrainEstimate: AppBrainEstimateSchema.nullable(),
  nextVerification: z.array(z.string()),
});

export const ResearchQueueSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  radarDate: z.string(),
  radarGeneratedAt: z.string(),
  method: z.object({
    name: z.literal('deterministic_research_priority_v1'),
    inputs: z.array(z.string()),
    exclusions: z.array(z.string()),
    statement: z.string(),
  }),
  sources: z.object({
    appleCharts: z.object({
      status: z.enum(['complete', 'partial']),
      origin: z.literal('official_public'),
      observedAt: z.string(),
      healthyGameMarkets: z.number().int().nonnegative(),
    }),
    appleLookup: z.object({
      status: z.enum(['complete', 'partial', 'failed']),
      origin: z.literal('official_public'),
      successfulApps: z.number().int().nonnegative(),
      failures: z.array(z.object({ appId: z.string(), country: z.string(), error: z.string() })),
    }),
    appBrain: z.object({
      status: z.enum(['unconfigured', 'complete', 'partial', 'failed']),
      origin: z.literal('third_party_estimate'),
      dailyCreditCap: z.number().int().min(0).max(10),
      creditsUsedThisRun: z.number().int().nonnegative(),
      successfulApps: z.number().int().nonnegative(),
      failures: z.array(z.object({ appId: z.string(), error: z.string() })),
      note: z.string(),
    }),
  }),
  limitations: z.array(z.string()).min(3),
  candidates: z.array(ResearchCandidateSchema).max(12),
});

export type ResearchQueue = z.infer<typeof ResearchQueueSchema>;
export type ResearchCandidate = z.infer<typeof ResearchCandidateSchema>;

export async function loadResearchQueue(): Promise<ResearchQueue> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/research/latest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Research queue request failed (${response.status}).`);
  return ResearchQueueSchema.parse(await response.json());
}

export function primaryMomentum(candidate: ResearchCandidate) {
  const signal = candidate.evidence.exactWindows['1d'];
  if (signal.status === 'available' && signal.bestUpwardDelta != null) {
    return signal.bestUpwardDelta > 0 ? `+${signal.bestUpwardDelta} best 1d move` : `${signal.bestUpwardDelta} best 1d move`;
  }
  if (signal.status === 'not_ranked') return 'entered tracked range';
  return '1d history pending';
}
