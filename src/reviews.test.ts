import { describe, expect, it } from 'vitest';
import { analyzeReviewSample } from './reviews';

describe('analyzeReviewSample', () => {
  it('parses optional ratings and preserves review text', () => {
    const result = analyzeReviewSample('5 | Love this game\nThis is fine');
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({ rating: 5, text: 'Love this game' });
    expect(result.entries[1]).toMatchObject({ rating: null, text: 'This is fine' });
  });

  it('supports multi-label evidence without forcing one sentiment bucket', () => {
    const result = analyzeReviewSample('1 | Too many ads, impossible level and it keeps crashing so I uninstalled it');
    const labels = result.entries[0].labels;
    expect(labels).toContain('negative');
    expect(labels).toContain('ads');
    expect(labels).toContain('difficulty');
    expect(labels).toContain('bugs');
    expect(labels).toContain('quit_reasons');
  });

  it('uses supplied rating as direct positive/negative sample evidence', () => {
    const result = analyzeReviewSample('4 | Solid\n2 | Fine but not for me');
    expect(result.entries[0].labels).toContain('positive');
    expect(result.entries[1].labels).toContain('negative');
  });

  it('computes cluster share strictly from this sample denominator', () => {
    const result = analyzeReviewSample('Too many ads\nGreat game\nMore ads again\nNo complaint');
    const ads = result.clusters.find((cluster) => cluster.clusterKey === 'ads');
    expect(ads?.reviewCount).toBe(2);
    expect(ads?.sampleShare).toBe(0.5);
    expect(ads?.evidenceSequences).toEqual([1, 3]);
  });

  it('keeps unmatched reviews rather than inventing a classification', () => {
    const result = analyzeReviewSample('Purple umbrella on Tuesday');
    expect(result.entries[0].labels).toEqual([]);
    expect(result.clusters.every((cluster) => cluster.reviewCount === 0)).toBe(true);
  });

  it('rejects an empty sample', () => {
    expect(() => analyzeReviewSample(' \n ')).toThrow(/at least one/i);
  });

  it('caps processing at 500 supplied review rows', () => {
    const input = Array.from({ length: 520 }, (_, index) => `Great game ${index}`).join('\n');
    const result = analyzeReviewSample(input);
    expect(result.entries).toHaveLength(500);
  });
});
