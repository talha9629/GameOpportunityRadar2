import { describe, expect, it } from 'vitest';
import { decideOpportunity, type Scorecard } from './decision';

const base = (overrides: Partial<Scorecard> = {}): Scorecard => ({
  momentum: 4,
  soloFit: 4,
  differentiation: 3,
  saturation: 2,
  risk: 2,
  confidence: 3,
  hardBlocks: [],
  ...overrides,
});

describe('decideOpportunity', () => {
  it('returns PROTOTYPE when all prototype thresholds are met', () => {
    expect(decideOpportunity(base()).status).toBe('PROTOTYPE');
  });

  it('returns VERIFY when evidence is incomplete', () => {
    expect(decideOpportunity(base({ momentum: null })).status).toBe('VERIFY');
  });

  it('returns PASS for a hard blocker', () => {
    expect(decideOpportunity(base({ hardBlocks: ['IP risk'] })).status).toBe('PASS');
  });

  it('returns PASS when solo fit is too low', () => {
    expect(decideOpportunity(base({ soloFit: 2 })).status).toBe('PASS');
  });

  it('returns TOO LATE for high saturation and low differentiation', () => {
    expect(decideOpportunity(base({ saturation: 4, differentiation: 2 })).status).toBe('TOO LATE');
  });

  it('returns VERIFY when confidence is 2 or lower', () => {
    expect(decideOpportunity(base({ confidence: 2 })).status).toBe('VERIFY');
  });
});
