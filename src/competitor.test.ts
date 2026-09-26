import { describe, expect, it } from 'vitest';
import { differentiationSummary, emptyDifferentiation, listingProfile } from './competitor';
import type { AnalysisResult } from './domain';

const result: AnalysisResult = {
  game: {
    platform: 'ios', storeId: '1', canonicalName: 'Test', publisher: 'Studio', storeUrl: 'https://example.com/app',
    iconUrl: null, description: null, rating: 4.5, ratingCount: 100, releaseDate: null, currentVersionReleaseDate: null, screenshots: [],
  },
  sourceMode: 'automated',
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
});
