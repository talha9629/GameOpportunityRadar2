import { describe, expect, it } from 'vitest';
import { isPlatformScope, PLATFORM_META, TRACKED_APPLE_MARKETS } from './platformScope';
import { GooglePlayRadarSchema } from './googlePlayRadar';

const googleSource = {
  provider: 'AppBrain' as const,
  endpoint: 'https://api.appbrain.com/v2/info/browse',
  origin: 'third_party_public' as const,
  estimateOrigin: 'third_party_estimate' as const,
  orderingSemantics: 'provider_popularity_position' as const,
  method: 'AppBrain POPULAR browse ordering for Android apps filtered to the provider GAME category',
  countryScope: 'provider_global_not_country_specific' as const,
  requestedDepth: 50 as const,
  completenessPolicy: 'exact_requested_depth_required' as const,
  creditsPerRun: 12 as const,
  freeMonthlyCreditBudget: 500 as const,
};

const googleLimitations = [
  'No Apple inference.',
  'No official Google rank claim.',
  'Displayed positions are AppBrain provider positions.',
  'Downloads remain third-party estimates.',
  'Exact 50-result coverage is required for success.',
];

describe('platform scope', () => {
  it('distinguishes platform from Apple storefront markets', () => {
    expect(TRACKED_APPLE_MARKETS.map((market) => market.short)).toEqual(['US', 'UK', 'CA', 'AU']);
    expect(PLATFORM_META.apple.label).toBe('Apple App Store');
    expect(PLATFORM_META.google_play.label).toBe('Google Play');
    expect(PLATFORM_META.amazon_fire.label).toContain('Fire');
  });

  it('accepts only known research scopes', () => {
    expect(isPlatformScope('cross')).toBe(true);
    expect(isPlatformScope('google_play')).toBe(true);
    expect(isPlatformScope('amazon')).toBe(false);
    expect(isPlatformScope('android')).toBe(false);
  });
});

describe('Google Play provider contract', () => {
  it('accepts an unconfigured provider state without candidate leakage', () => {
    const parsed = GooglePlayRadarSchema.parse({
      schemaVersion: 1,
      generatedAt: '2026-09-27T04:25:00.000Z',
      platform: 'google_play',
      platformLabel: 'Google Play',
      source: googleSource,
      status: 'unconfigured',
      chartDepth: 50,
      message: 'Provider key is missing.',
      entries: [],
      limitations: googleLimitations,
    });
    expect(parsed.entries).toHaveLength(0);
    expect(parsed.source.countryScope).toBe('provider_global_not_country_specific');
    expect(parsed.source.orderingSemantics).toBe('provider_popularity_position');
  });

  it('requires download provenance to stay third-party estimate', () => {
    const result = GooglePlayRadarSchema.safeParse({
      schemaVersion: 1,
      generatedAt: '2026-09-27T04:25:00.000Z',
      platform: 'google_play',
      platformLabel: 'Google Play',
      source: googleSource,
      status: 'ok',
      chartDepth: 50,
      completeness: { requested: 50, received: 50, uniquePackages: 50, exactDepthSatisfied: true },
      entries: [{
        rank: 1,
        rankSemantics: 'appbrain_popularity_position',
        previousObservedRank: null,
        observedDelta: null,
        previousObservedAt: null,
        observationGapDays: null,
        packageName: 'com.example.game',
        name: 'Example Game',
        publisher: 'Example Studio',
        category: 'GAME',
        iconUrl: null,
        storeUrl: 'https://play.google.com/store/apps/details?id=com.example.game',
        rating: 4.2,
        ratingCount: 100,
        downloadsCategory: '100K+',
        estimatedDownloads: 120000,
        estimatedRecentDownloads: 10000,
        firstObserved: '2026-09-27',
        observations: 1,
        evidence: { rank: 'third_party_public', rating: 'third_party_public', downloads: 'official_public' },
      }],
      limitations: googleLimitations,
    });
    expect(result.success).toBe(false);
  });
});
