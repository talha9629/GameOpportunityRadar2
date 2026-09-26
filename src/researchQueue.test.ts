import { describe, expect, it } from 'vitest';
import { ResearchQueueSchema } from './researchQueue';

const base = {
  schemaVersion: 1 as const,
  generatedAt: '2026-09-26T17:45:00.000Z',
  radarDate: '2026-09-26',
  radarGeneratedAt: '2026-09-26T14:11:37.758Z',
  method: {
    name: 'deterministic_research_priority_v1' as const,
    inputs: ['Apple Games chart rank'],
    exclusions: ['downloads', 'revenue'],
    statement: 'Priority orders what to investigate first. It is not an opportunity score, prediction, recommendation or causal claim.',
  },
  sources: {
    appleCharts: { status: 'complete' as const, origin: 'official_public' as const, observedAt: '2026-09-26T14:11:37.758Z', healthyGameMarkets: 4 },
    appleLookup: { status: 'complete' as const, origin: 'official_public' as const, successfulApps: 1, failures: [] },
    appBrain: { status: 'unconfigured' as const, origin: 'third_party_estimate' as const, dailyCreditCap: 10, creditsUsedThisRun: 0, successfulApps: 0, failures: [], note: 'Estimates do not affect priority.' },
  },
  limitations: ['App Store chart rank is not a download count.', 'Android is not inferred from iOS.', 'Missing history stays unknown.'],
  candidates: [],
};

describe('ResearchQueueSchema', () => {
  it('accepts an empty but valid automated queue', () => {
    expect(ResearchQueueSchema.parse(base).sources.appBrain.status).toBe('unconfigured');
  });

  it('rejects unlabeled AppBrain-style data', () => {
    const malformed = {
      ...base,
      candidates: [{
        queueRank: 1,
        appId: '6761760135',
        name: 'Meowdoku!',
        publisher: 'Oakever Games',
        iconUrl: null,
        storeUrl: null,
        researchPriority: 42,
        priorityMeaning: 'Deterministic research ordering; not a success probability or build recommendation.',
        reasonCodes: ['TOP_3'],
        evidence: {
          sourceOrigin: 'official_public',
          chartCategory: 'Games',
          marketCount: 1,
          bestRank: 1,
          averageRank: 1,
          maxObservedDays: 1,
          newEntry: true,
          markets: [{ country: 'us', market: 'United States', rank: 1, priorRank: null, delta: null, daysObserved: 1, bestObservedRank: 1, newEntry: true, sourceMode: 'apple_itunes_rss_games', observedAt: '2026-09-26T14:11:37.758Z' }],
          exactWindows: {
            '1d': { days: 1, status: 'history_missing', bestUpwardDelta: null, perMarket: [] },
            '3d': { days: 3, status: 'history_missing', bestUpwardDelta: null, perMarket: [] },
            '7d': { days: 7, status: 'history_missing', bestUpwardDelta: null, perMarket: [] },
          },
        },
        appleMetadata: null,
        appBrainEstimate: { sourceOrigin: 'official_public', interpretation: 'direct_provider_value', provider: 'AppBrain', observedAt: '2026-09-26T17:45:00.000Z', package: 'ios-6761760135', estimatedDownloads: 1000, estimatedRecentDownloads: 100, downloadsCategory: null, rating: null, ratingCount: null, infoRefreshTime: null },
        nextVerification: [],
      }],
    };
    expect(() => ResearchQueueSchema.parse(malformed)).toThrow();
  });
});
