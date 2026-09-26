import { describe, expect, it } from 'vitest';
import {
  assessRadarTrend,
  crossMarketLeaders,
  historyMaturity,
  rankVisibility,
  rankWindowChange,
  type RadarSnapshot,
} from './radar';

function entry(appId: string, rank: number, daysObserved = 1) {
  return {
    rank,
    priorRank: null,
    delta: null,
    appId,
    name: `Game ${appId}`,
    publisher: 'Publisher',
    iconUrl: null,
    storeUrl: null,
    firstObserved: '2026-09-20',
    daysObserved,
    bestObservedRank: rank,
    events: [],
  };
}

function snapshot(
  date: string,
  rank: number | null,
  status: 'ok' | 'failed' = 'ok',
  options: { daysObserved?: number; gameFocused?: boolean } = {},
): RadarSnapshot {
  return {
    schemaVersion: 3,
    generatedAt: `${date}T03:05:00.000Z`,
    chart: 'top-free',
    category: 'Games',
    chartDepth: 100,
    runStatus: status === 'ok' ? 'complete' : 'partial',
    successfulMarkets: status === 'ok' ? 1 : 0,
    markets: {
      us: {
        country: 'us',
        label: 'United States',
        status,
        gameFocused: options.gameFocused ?? true,
        entries: rank == null ? [] : [entry('game-a', rank, options.daysObserved ?? 1)],
      },
    },
  };
}

describe('Radar exact-date trend semantics', () => {
  it('does not interpolate a missing exact comparison date', () => {
    const current = snapshot('2026-09-26', 10);
    const twoDaysAgo = snapshot('2026-09-24', 20);
    const change = rankWindowChange(current, [current, twoDaysAgo], 'us', 'game-a', 1);
    expect(change.status).toBe('history_missing');
    expect(change.delta).toBeNull();
  });

  it('computes rank improvement only from the exact dated snapshot', () => {
    const current = snapshot('2026-09-26', 10);
    const prior = snapshot('2026-09-25', 18);
    const change = rankWindowChange(current, [current, prior], 'us', 'game-a', 1);
    expect(change.status).toBe('available');
    expect(change.priorRank).toBe(18);
    expect(change.delta).toBe(8);
  });

  it('distinguishes not-ranked from missing history', () => {
    const current = snapshot('2026-09-26', 10);
    const prior = snapshot('2026-09-25', null);
    const change = rankWindowChange(current, [current, prior], 'us', 'game-a', 1);
    expect(change.status).toBe('not_ranked');
    expect(change.delta).toBeNull();
  });

  it('requires consecutive daily observations for maturity', () => {
    const history = [
      snapshot('2026-09-26', 10),
      snapshot('2026-09-25', 11),
      snapshot('2026-09-24', 12),
      snapshot('2026-09-23', 13),
      snapshot('2026-09-21', 14),
    ];
    const maturity = historyMaturity(history);
    expect(maturity.observedDays).toBe(5);
    expect(maturity.consecutiveDays).toBe(4);
    expect(maturity.label).toBe('BUILDING');
  });
});

describe('rankVisibility', () => {
  it('implements the bounded log-rank heuristic inside the observed chart only', () => {
    expect(rankVisibility(1, 100)).toBeCloseTo(1, 10);
    expect(rankVisibility(10, 100)).toBeGreaterThan(rankVisibility(50, 100) ?? 0);
    expect(rankVisibility(50, 100)).toBeGreaterThan(rankVisibility(100, 100) ?? 0);
    expect(rankVisibility(100, 100)).toBeGreaterThanOrEqual(0);
    expect(rankVisibility(100, 100)).toBeLessThanOrEqual(1);
  });

  it('rejects ranks outside the observed chart depth', () => {
    expect(rankVisibility(0, 100)).toBeNull();
    expect(rankVisibility(101, 100)).toBeNull();
    expect(rankVisibility(1, 0)).toBeNull();
  });
});

describe('assessRadarTrend', () => {
  it('keeps a first observation insufficient rather than inventing momentum', () => {
    const current = snapshot('2026-09-27', 5);
    expect(assessRadarTrend(current, [current], 'us', 'game-a').state).toBe('INSUFFICIENT_DATA');
  });

  it('marks an exact prior-day tracked-range entry as emerging when it enters high', () => {
    const current = snapshot('2026-09-27', 12);
    const prior = snapshot('2026-09-26', null);
    expect(assessRadarTrend(current, [current, prior], 'us', 'game-a')).toMatchObject({
      state: 'EMERGING',
      evidenceDays: [1],
    });
  });

  it('requires exact movement evidence for rising and declining states', () => {
    const rising = snapshot('2026-09-27', 10, 'ok', { daysObserved: 4 });
    const risingPrior = snapshot('2026-09-24', 30);
    expect(assessRadarTrend(rising, [rising, risingPrior], 'us', 'game-a').state).toBe('RISING');

    const declining = snapshot('2026-09-27', 30, 'ok', { daysObserved: 8 });
    const decliningPrior = snapshot('2026-09-20', 10);
    expect(assessRadarTrend(declining, [declining, decliningPrior], 'us', 'game-a').state).toBe('DECLINING');
  });

  it('requires persistence plus an exact seven-day comparison for established', () => {
    const current = snapshot('2026-09-27', 12, 'ok', { daysObserved: 8 });
    const prior = snapshot('2026-09-20', 13);
    expect(assessRadarTrend(current, [current, prior], 'us', 'game-a')).toMatchObject({
      state: 'ESTABLISHED',
      evidenceDays: [7],
    });
  });

  it('never infers saturation states from rank evidence alone', () => {
    const current = snapshot('2026-09-27', 1, 'ok', { daysObserved: 30 });
    const prior = snapshot('2026-09-20', 1);
    const state = assessRadarTrend(current, [current, prior], 'us', 'game-a').state;
    expect(['CROWDED', 'WINDOW_CLOSING']).not.toContain(state);
  });

  it('does not classify an overall Top Free fallback as a Games trend', () => {
    const current = snapshot('2026-09-27', 3, 'ok', { daysObserved: 8, gameFocused: false });
    const prior = snapshot('2026-09-20', 40);
    expect(assessRadarTrend(current, [current, prior], 'us', 'game-a').state).toBe('INSUFFICIENT_DATA');
  });
});

describe('crossMarketLeaders', () => {
  it('counts only healthy Games-category markets', () => {
    const current = snapshot('2026-09-26', 2);
    current.markets.gb = {
      country: 'gb', label: 'United Kingdom', status: 'ok', gameFocused: true,
      entries: [entry('game-a', 4)],
    };
    current.markets.ca = {
      country: 'ca', label: 'Canada', status: 'failed', gameFocused: true,
      entries: [entry('game-a', 1)],
    };
    current.markets.au = {
      country: 'au', label: 'Australia', status: 'ok', gameFocused: false,
      entries: [entry('game-a', 1)],
    };

    const [leader] = crossMarketLeaders(current, 1);
    expect(leader.marketCount).toBe(2);
    expect(leader.bestRank).toBe(2);
    expect(leader.averageRank).toBe(3);
  });
});
