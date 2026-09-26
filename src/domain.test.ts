import { describe, expect, it } from 'vitest';
import { AnalysisResultSchema, GameInputSchema } from './domain';

describe('Radar validation', () => {
  it('rejects empty game input', () => {
    expect(() => GameInputSchema.parse(' ')).toThrow();
  });

  it('accepts a valid evidence-backed analysis shape', () => {
    const parsed = AnalysisResultSchema.parse({
      game: {
        platform: 'ios',
        storeId: '12345',
        canonicalName: 'Example Game',
        publisher: 'Example Studio',
        storeUrl: 'https://apps.apple.com/app/id12345',
        iconUrl: null,
        description: null,
        rating: 4.5,
        ratingCount: 100,
        releaseDate: null,
        currentVersionReleaseDate: null,
        screenshots: [],
      },
      findings: [{
        id: 'finding-1',
        key: 'rating',
        label: 'Rating',
        value: '4.5',
        origin: 'official_public',
        interpretation: 'direct',
        coverage: 'verified',
        reviewState: 'unreviewed',
        confidence: 1,
        evidenceLabel: 'Apple metadata',
      }],
      unknowns: ['Gameplay not verified'],
      sourceMode: 'automated',
    });

    expect(parsed.findings[0].coverage).toBe('verified');
  });
});
