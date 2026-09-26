import { describe, expect, it } from 'vitest';
import {
  PolicyIndexSchema,
  PolicyReviewSchema,
  buildPolicyDiff,
} from './policy';

describe('Policy Watch contracts', () => {
  it('keeps missing policy days/changes explicit instead of inventing them', () => {
    const index = PolicyIndexSchema.parse({
      schemaVersion: 1,
      generatedAt: '2026-09-26T00:00:00.000Z',
      runStatus: 'partial',
      sourceCount: 1,
      freshCount: 0,
      failureCount: 1,
      sources: [{
        id: 'apple-review', vendor: 'apple', title: 'Review', category: 'store_review', critical: true,
        url: 'https://developer.apple.com/example', fetchStatus: 'unavailable', lastAttemptAt: '2026-09-26T00:00:00.000Z',
        error: 'fetch failed', current: null, history: [], changes: [],
      }],
    });
    expect(index.sources[0].current).toBeNull();
    expect(index.sources[0].changes).toHaveLength(0);
  });

  it('produces an exact changed window with unchanged prefix/suffix counts', () => {
    const diff = buildPolicyDiff('A\nB\nC\nD', 'A\nB2\nC2\nD');
    expect(diff.commonPrefixLines).toBe(1);
    expect(diff.commonSuffixLines).toBe(1);
    expect(diff.removed).toEqual(['B', 'C']);
    expect(diff.added).toEqual(['B2', 'C2']);
  });

  it('accepts material owner review metadata without treating it as source evidence', () => {
    const review = PolicyReviewSchema.parse({
      changeId: 'a'.repeat(64),
      sourceId: 'google-play-ads',
      state: 'relevant',
      severity: 'material',
      affectedDimensions: ['risk', 'ads', 'monetization'],
      notes: 'Owner review only',
      reviewedAt: '2026-09-26T00:00:00.000Z',
      updatedAt: '2026-09-26T00:00:00.000Z',
    });
    expect(review.severity).toBe('material');
    expect(review.affectedDimensions).toContain('risk');
  });
});
