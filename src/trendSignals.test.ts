import { describe, expect, it } from 'vitest';
import { TrendSignalsPayloadSchema, trendWindowStatusCounts } from './trendSignals';

function payloadWithStatus(status: 'coverage_gap' | 'source_mismatch') {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-27T03:00:00.000Z',
    radarGeneratedAt: '2026-09-27T02:50:00.000Z',
    radarDate: '2026-09-27',
    chart: 'top-free',
    category: 'Games',
    chartDepth: 100,
    statement: 'Trend signals describe exact Apple chart observations and never infer downloads or revenue from rank position.',
    method: {
      name: 'exact_rank_trend_signals_v1',
      lookbackDays: [1, 3, 7],
      visibilityFormula: 'ln((N+1)/rank)/ln(N+1)',
      statesEmitted: ['EMERGING', 'RISING', 'ESTABLISHED', 'DECLINING', 'INSUFFICIENT_DATA'],
      statesReservedForOtherEvidence: ['CROWDED', 'WINDOW_CLOSING'],
      missingHistoryRule: 'Never interpolate a missing exact date and never interpret source mismatch as movement.',
    },
    summary: {
      marketCount: 1,
      healthyGameMarkets: 1,
      signalCount: 1,
      stateCounts: { INSUFFICIENT_DATA: 1 },
    },
    markets: {
      us: {
        country: 'us',
        label: 'United States',
        status: 'ok',
        sourceMode: 'apple_itunes_rss_games',
        gameFocused: true,
        signals: [{
          appId: '6761760135',
          name: 'Example Game',
          publisher: 'Example Publisher',
          rank: 70,
          chartDepth: 100,
          visibility: 0.08,
          daysObserved: 1,
          bestObservedRank: 70,
          exactWindows: {
            '1d': { days: 1, targetDate: '2026-09-26', status, priorRank: null, currentRank: null, delta: null },
            '3d': { days: 3, targetDate: '2026-09-24', status: 'history_missing', priorRank: null, currentRank: null, delta: null },
            '7d': { days: 7, targetDate: '2026-09-20', status: 'history_missing', priorRank: null, currentRank: null, delta: null },
          },
          trend: {
            state: 'INSUFFICIENT_DATA',
            reason: 'The exact comparison is not admissible, so no directional trend is inferred from this window.',
            evidenceDays: [],
          },
        }],
      },
    },
  };
}

describe('TrendSignalsPayloadSchema', () => {
  it('accepts coverage gaps instead of breaking the Trends page', () => {
    const parsed = TrendSignalsPayloadSchema.parse(payloadWithStatus('coverage_gap'));
    expect(parsed.markets.us.signals[0].exactWindows['1d'].status).toBe('coverage_gap');
  });

  it('accepts source mismatches instead of treating incomparable charts as movement', () => {
    const parsed = TrendSignalsPayloadSchema.parse(payloadWithStatus('source_mismatch'));
    expect(parsed.markets.us.signals[0].exactWindows['1d'].status).toBe('source_mismatch');
  });

  it('counts conservative comparison failures separately', () => {
    const parsed = TrendSignalsPayloadSchema.parse(payloadWithStatus('coverage_gap'));
    const counts = trendWindowStatusCounts(parsed);
    expect(counts.coverage_gap).toBe(1);
    expect(counts.history_missing).toBe(2);
    expect(counts.available).toBe(0);
  });
});
