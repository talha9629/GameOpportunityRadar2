import { describe, expect, it } from 'vitest';
import {
  CompetitorMapPayloadSchema,
  differentiationSummary,
  emptyDifferentiation,
  listingProfile,
} from './competitor';
import type { AnalysisResult } from './domain';

const result: AnalysisResult = {
  game: {
    platform: 'ios', storeId: '1', canonicalName: 'Test', publisher: 'Studio', storeUrl: 'https://example.com/app',
    iconUrl: null, description: null, rating: 4.5, ratingCount: 100, releaseDate: null, currentVersionReleaseDate: null, screenshots: [],
  },
  sourceMode: 'automated',
  sourceObservedAt: '2026-09-26T13:00:00.000Z',
  rawSource: { trackId: 1 },
  unknowns: [],
  findings: [
    { id: '1', key: 'listing_mechanics', label: 'Mechanics', value: 'Puzzle, Sorting', origin: 'official_public', interpretation: 'direct', coverage: 'partial', reviewState: 'unreviewed', confidence: .8, evidenceLabel: 'listing' },
    { id: '2', key: 'rating', label: 'Rating', value: '4.5', origin: 'official_public', interpretation: 'direct', coverage: 'verified', reviewState: 'unreviewed', confidence: 1, evidenceLabel: 'listing' },
  ],
};

describe('competitor helpers', () => {
  it('extracts only supported listing signals', () => {
    expect(listingProfile(result)).toEqual({ mechanics: 'Puzzle, Sorting', controls: 'Unknown', systems: 'Unknown', monetization: 'Unknown', rating: '4.5', ratingCount: 'Unknown' });
  });

  it('starts differentiation as unknown', () => {
    const map = emptyDifferentiation();
    expect(differentiationSummary(map)).toEqual({ different: 0, similar: 0, unknown: 12 });
  });

  it('round-trips a human-confirmed persisted competitor map', () => {
    const differentiation = emptyDifferentiation();
    differentiation['Core mechanic'] = { state: 'similar', note: 'same core loop' };
    differentiation.Controls = { state: 'meaningfully_different', note: 'different gesture' };

    const payload = CompetitorMapPayloadSchema.parse({
      primary: result,
      competitors: [{
        id: '11111111-1111-4111-8111-111111111111',
        analysis: { ...result, game: { ...result.game, storeId: '2', canonicalName: 'Competitor', storeUrl: 'https://example.com/competitor' } },
        relationship: 'DIRECT_COMPETITOR',
        differentiation,
        confirmedAt: '2026-09-26T13:05:00.000Z',
      }],
    });

    expect(payload.competitors[0].relationship).toBe('DIRECT_COMPETITOR');
    expect(payload.competitors[0].differentiation.Controls).toEqual({ state: 'meaningfully_different', note: 'different gesture' });
  });

  it('rejects unsupported relationship values and incomplete differentiation', () => {
    expect(() => CompetitorMapPayloadSchema.parse({
      primary: result,
      competitors: [{
        id: '11111111-1111-4111-8111-111111111111',
        analysis: result,
        relationship: 'AUTO_CLONE',
        differentiation: {},
      }],
    })).toThrow();
  });
});
