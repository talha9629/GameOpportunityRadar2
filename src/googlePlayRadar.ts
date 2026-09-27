import { z } from 'zod';

const GooglePlayEntrySchema = z.object({
  rank: z.number().int().min(1).max(50),
  rankSemantics: z.literal('appbrain_popularity_position'),
  previousObservedRank: z.number().int().min(1).max(50).nullable(),
  observedDelta: z.number().int().nullable(),
  previousObservedAt: z.string().nullable(),
  observationGapDays: z.number().int().nonnegative().nullable(),
  packageName: z.string().min(3),
  name: z.string().min(1),
  publisher: z.string(),
  category: z.string().nullable(),
  iconUrl: z.string().nullable(),
  storeUrl: z.string().url(),
  rating: z.number().nullable(),
  ratingCount: z.number().int().nonnegative().nullable(),
  downloadsCategory: z.string().nullable(),
  estimatedDownloads: z.number().nonnegative().nullable(),
  estimatedRecentDownloads: z.number().nonnegative().nullable(),
  firstObserved: z.string().min(10),
  observations: z.number().int().positive(),
  evidence: z.object({
    rank: z.literal('third_party_public'),
    rating: z.literal('third_party_public'),
    downloads: z.literal('third_party_estimate'),
  }),
});

export const GooglePlayRadarSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  platform: z.literal('google_play'),
  platformLabel: z.literal('Google Play'),
  source: z.object({
    provider: z.literal('AppBrain'),
    endpoint: z.string().url(),
    origin: z.literal('third_party_public'),
    estimateOrigin: z.literal('third_party_estimate'),
    orderingSemantics: z.literal('provider_popularity_position'),
    method: z.string(),
    countryScope: z.literal('provider_global_not_country_specific'),
    requestedDepth: z.literal(50),
    completenessPolicy: z.literal('exact_requested_depth_required'),
    creditsPerRun: z.literal(12),
    freeMonthlyCreditBudget: z.literal(500),
  }),
  status: z.enum(['unconfigured', 'ok', 'failed']),
  chartDepth: z.literal(50),
  observedAt: z.string().optional(),
  creditsUsedThisRun: z.number().int().nonnegative().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  previousSuccessfulAt: z.string().nullable().optional(),
  completeness: z.object({
    requested: z.literal(50),
    received: z.literal(50),
    uniquePackages: z.literal(50),
    exactDepthSatisfied: z.literal(true),
  }).optional(),
  entries: z.array(GooglePlayEntrySchema).max(50),
  limitations: z.array(z.string()).min(5),
}).superRefine((data, ctx) => {
  if (data.status === 'ok') {
    if (data.entries.length !== data.chartDepth) {
      ctx.addIssue({ code: 'custom', path: ['entries'], message: `Successful Google Play evidence must contain exactly ${data.chartDepth} entries.` });
    }
    if (!data.completeness) {
      ctx.addIssue({ code: 'custom', path: ['completeness'], message: 'Successful Google Play evidence requires exact-depth completeness proof.' });
    }
    const packages = new Set(data.entries.map((entry) => entry.packageName));
    if (packages.size !== data.chartDepth) {
      ctx.addIssue({ code: 'custom', path: ['entries'], message: 'Successful Google Play evidence must contain 50 unique packages.' });
    }
    data.entries.forEach((entry, index) => {
      if (entry.rank !== index + 1) ctx.addIssue({ code: 'custom', path: ['entries', index, 'rank'], message: 'Provider position sequence is incomplete.' });
      if (entry.previousObservedRank == null && entry.observedDelta != null) {
        ctx.addIssue({ code: 'custom', path: ['entries', index, 'observedDelta'], message: 'Movement cannot exist without a previous successful observation.' });
      }
      if (entry.previousObservedRank != null && entry.observedDelta !== entry.previousObservedRank - entry.rank) {
        ctx.addIssue({ code: 'custom', path: ['entries', index, 'observedDelta'], message: 'Movement does not match provider position arithmetic.' });
      }
    });
  } else if (data.entries.length !== 0) {
    ctx.addIssue({ code: 'custom', path: ['entries'], message: `${data.status} provider state must not expose fresh entries.` });
  }
});

export type GooglePlayRadar = z.infer<typeof GooglePlayRadarSchema>;
export type GooglePlayEntry = z.infer<typeof GooglePlayEntrySchema>;

function unconfiguredFallback(): GooglePlayRadar {
  return GooglePlayRadarSchema.parse({
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    platform: 'google_play',
    platformLabel: 'Google Play',
    source: {
      provider: 'AppBrain',
      endpoint: 'https://api.appbrain.com/v2/info/browse',
      origin: 'third_party_public',
      estimateOrigin: 'third_party_estimate',
      orderingSemantics: 'provider_popularity_position',
      method: 'AppBrain POPULAR browse ordering for Android apps filtered to the provider GAME category',
      countryScope: 'provider_global_not_country_specific',
      requestedDepth: 50,
      completenessPolicy: 'exact_requested_depth_required',
      creditsPerRun: 12,
      freeMonthlyCreditBudget: 500,
    },
    status: 'unconfigured',
    chartDepth: 50,
    message: 'Google Play automation has not produced its first provider state yet.',
    entries: [],
    limitations: [
      'AppBrain is required for automated Google Play competitor discovery.',
      'This feed is third-party market intelligence, not an official Google Play ranking API.',
      'Displayed positions are AppBrain popularity positions, not Google Play storefront ranks.',
      'Download values, when available, remain third-party estimates.',
      'Successful snapshots require exactly 50 unique provider results.',
    ],
  });
}

export async function loadGooglePlayRadar(): Promise<GooglePlayRadar> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/platforms/google-play/latest.json`, { cache: 'no-store' });
  if (response.status === 404) return unconfiguredFallback();
  if (!response.ok) throw new Error(`Google Play Radar request failed (${response.status}).`);
  return GooglePlayRadarSchema.parse(await response.json());
}
