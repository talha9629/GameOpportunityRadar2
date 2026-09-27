import { z } from 'zod';

const GooglePlayEntrySchema = z.object({
  rank: z.number().int().positive(),
  previousObservedRank: z.number().int().positive().nullable(),
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
    method: z.string(),
    countryScope: z.literal('provider_global_not_country_specific'),
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
  entries: z.array(GooglePlayEntrySchema).max(50),
  limitations: z.array(z.string()).min(3),
});

export type GooglePlayRadar = z.infer<typeof GooglePlayRadarSchema>;
export type GooglePlayEntry = z.infer<typeof GooglePlayEntrySchema>;

export async function loadGooglePlayRadar(): Promise<GooglePlayRadar> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/platforms/google-play/latest.json`, { cache: 'no-store' });
  if (response.status === 404) {
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
        method: 'POPULAR Android apps filtered to Google Play GAME category by provider query',
        countryScope: 'provider_global_not_country_specific',
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
        'Download values, when available, remain third-party estimates.',
      ],
    });
  }
  if (!response.ok) throw new Error(`Google Play Radar request failed (${response.status}).`);
  return GooglePlayRadarSchema.parse(await response.json());
}
