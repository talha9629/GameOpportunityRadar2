import { describe, expect, it } from 'vitest';
import { deriveDossierStatusSummary } from './analyzeSummary';
import type { DecisionResult } from './decision';

const decision = (overrides: Partial<DecisionResult> = {}): DecisionResult => ({
  status: 'VERIFY',
  reasons: ['Critical score dimensions still need evidence.'],
  missing: ['momentum', 'soloFit', 'differentiation', 'saturation', 'risk'],
  ...overrides,
});

describe('deriveDossierStatusSummary', () => {
  it('prioritizes human review before unknowns or scorecard work', () => {
    const summary = deriveDossierStatusSummary({
      rawSourceCaptured: true,
      findingCount: 9,
      reviewedCount: 2,
      unknownCount: 6,
      decision: decision(),
    });

    expect(summary.source.label).toBe('Raw source captured');
    expect(summary.review.label).toBe('2/9 reviewed');
    expect(summary.unknowns.label).toBe('6 unresolved');
    expect(summary.decision.label).toBe('Scorecard incomplete');
    expect(summary.nextAction).toMatchObject({ label: 'Review store findings', target: 'findings' });
  });

  it('routes to unresolved evidence after all findings are reviewed', () => {
    const summary = deriveDossierStatusSummary({
      rawSourceCaptured: true,
      findingCount: 9,
      reviewedCount: 9,
      unknownCount: 6,
      decision: decision(),
    });

    expect(summary.review.complete).toBe(true);
    expect(summary.nextAction).toMatchObject({ label: 'Verify unresolved evidence', target: 'unknowns' });
  });

  it('keeps unsupported score dimensions explicit after evidence gaps are closed', () => {
    const summary = deriveDossierStatusSummary({
      rawSourceCaptured: true,
      findingCount: 9,
      reviewedCount: 9,
      unknownCount: 0,
      decision: decision({ missing: ['momentum'] }),
    });

    expect(summary.decision.label).toBe('Scorecard incomplete');
    expect(summary.nextAction).toMatchObject({ label: 'Complete evidence-backed scores', target: 'scorecard' });
  });

  it('keeps a decisive PASS gate visible even when other dimensions are blank', () => {
    const summary = deriveDossierStatusSummary({
      rawSourceCaptured: true,
      findingCount: 9,
      reviewedCount: 9,
      unknownCount: 0,
      decision: decision({
        status: 'PASS',
        reasons: ['One or more hard blockers are active.'],
        missing: ['momentum', 'differentiation'],
      }),
    });

    expect(summary.decision.label).toBe('PASS gate active');
    expect(summary.decision.detail).toContain('already determines the preliminary threshold result');
    expect(summary.nextAction).toMatchObject({ label: 'Review preliminary threshold result', target: 'scorecard' });
  });

  it('never converts a complete scorecard into BUILD NOW guidance', () => {
    const summary = deriveDossierStatusSummary({
      rawSourceCaptured: true,
      findingCount: 9,
      reviewedCount: 9,
      unknownCount: 0,
      decision: decision({ status: 'PROTOTYPE', reasons: ['All prototype thresholds are currently met.'], missing: [] }),
    });

    expect(summary.decision.label).toBe('PROTOTYPE threshold result');
    expect(summary.decision.detail).toContain('not a success forecast or BUILD NOW decision');
    expect(summary.nextAction.label).toBe('Review preliminary threshold result');
    expect(summary.nextAction.detail).toContain('Human review');
  });

  it('marks historical normalized-only dossiers without pretending raw provenance exists', () => {
    const summary = deriveDossierStatusSummary({
      rawSourceCaptured: false,
      findingCount: 7,
      reviewedCount: 7,
      unknownCount: 0,
      decision: decision({ status: 'WATCH', reasons: ['Momentum is not yet strong enough.'], missing: [] }),
    });

    expect(summary.source.complete).toBe(false);
    expect(summary.source.label).toBe('Normalized snapshot only');
    expect(summary.source.detail).toContain('does not contain the original raw store response');
  });
});
