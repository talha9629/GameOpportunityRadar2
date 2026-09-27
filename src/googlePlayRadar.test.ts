import { describe, expect, it } from 'vitest';
import { GooglePlayRadarSchema } from './googlePlayRadar';

function source() {
  return {
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
}

function entry(rank: number) {
  return {
    rank,
    rankSemantics: 'appbrain_popularity_position' as const,
    previousObservedRank: null,
    observedDelta: null,
    previousObservedAt: null,
    observationGapDays: null,
    packageName: `com.example.game${rank}`,
    name: `Game ${rank}`,
    publisher: 'Example',
    category: 'GAME',
    iconUrl: null,
    storeUrl: `https://play.google.com/store/apps/details?id=com.example.game${rank}`,
    rating: null,
    ratingCount: null,
    downloadsCategory: null,
    estimatedDownloads: null,
    estimatedRecentDownloads: null,
    firstObserved: '2026-09-27',
    observations: 1,
    evidence: {
      rank: 'third_party_public' as const,
      rating: 'third_party_public' as const,
      downloads: 'third_party_estimate' as const,
    },
  };
}

function snapshot(count: number) {
  return {
    schemaVersion: 1 as const,
    generatedAt: '2026-09-27T00:00:00.000Z',
    platform: 'google_play' as const,
    platformLabel: 'Google Play' as const,
    source: source(),
    status: 'ok' as const,
    chartDepth: 50 as const,
    observedAt: '2026-09-27T00:00:00.000Z',
    creditsUsedThisRun: 12,
    completeness: {
      requested: 50 as const,
      received: 50 as const,
      uniquePackages: 50 as const,
      exactDepthSatisfied: true as const,
    },
    entries: Array.from({ length: count }, (_, index) => entry(index + 1)),
    limitations: [
      'Third-party source.',
      'Provider position only.',
      'No official Google rank.',
      'Downloads are estimates.',
      'Exact depth required.',
    ],
  };
}

describe('Google Play Radar evidence contract', () => {
  it('accepts exactly 50 unique AppBrain popularity positions', () => {
    expect(GooglePlayRadarSchema.parse(snapshot(50)).entries).toHaveLength(50);
  });

  it('rejects a 49-result provider response as incomplete evidence', () => {
    expect(() => GooglePlayRadarSchema.parse(snapshot(49))).toThrow(/exactly 50 entries/i);
  });

  it('rejects duplicate packages even at declared depth', () => {
    const data = snapshot(50);
    data.entries[49] = { ...data.entries[49], packageName: data.entries[0].packageName };
    expect(() => GooglePlayRadarSchema.parse(data)).toThrow(/50 unique packages/i);
  });
});
