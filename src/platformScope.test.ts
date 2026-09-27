import { describe, expect, it } from 'vitest';
import { isPlatformScope, PLATFORM_META, TRACKED_APPLE_MARKETS } from './platformScope';
import { GooglePlayRadarSchema } from './googlePlayRadar';

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
      source: {
        provider: 'AppBrain',
        endpoint: 'https://api.appbrain.com/v2/info/browse',
        origin: 'third_party_public',
        estimateOrigin: 'third_party_estimate',
        method: 'POPULAR Android GAME browse',
        countryScope: 'provider_global_not_country_specific',
        creditsPerRun: 12,
        freeMonthlyCreditBudget: 500,
      },
      status: 'unconfigured',
      chartDepth: 50,
      message: 'Provider key is missing.',
      entries: [],
      limitations: ['No Apple inference.', 'No official Google rank claim.', 'Downloads remain estimates.'],
    });
    expect(parsed.entries).toHaveLength(0);
    expect(parsed.source.countryScope).toBe('provider_global_not_country_specific');
  });

  it('requires download provenance to stay third-party estimate', () => {
    const result = GooglePlayRadarSchema.safeParse({
      schemaVersion: 1,
      generatedAt: '2026-09-27T04:25:00.000Z',
      platform: 'google_play',
      platformLabel: 'Google Play',
      source: {
        provider: 'AppBrain',
        endpoint: 'https://api.appbrain.com/v2/info/browse',
        origin: 'third_party_public',
        estimateOrigin: 'third_party_estimate',
        method: 'POPULAR Android GAME browse',
        countryScope: 'provider_global_not_country_specific',
        creditsPerRun: 12,
        freeMonthlyCreditBudget: 500,
      },
      status: 'ok',
      chartDepth: 50,
      entries: [{
        rank: 1,
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
      limitations: ['One', 'Two', 'Three'],
    });
    expect(result.success).toBe(false);
  });
});
