import { describe, expect, it } from 'vitest';
import { crossMarketLeaders, historyMaturity, rankWindowChange, type RadarSnapshot } from './radar';

function entry(appId: string, rank: number) {
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
    daysObserved: 1,
    bestObservedRank: rank,
    events: [],
  };
}

function snapshot(date: string, rank: number | null, status: 'ok' | 'failed' = 'ok'): RadarSnapshot {
  return {
    schemaVersion: 2,
    generatedAt: `${date}T03:05:00.000Z`,
    chart: 'top-free',
    category: 'Games',
    runStatus: status === 'ok' ? 'complete' : 'partial',
    successfulMarkets: status === 'ok' ? 1 : 0,
    markets: {
      us: {
        country: 'us',
        label: 'United States',
        status,
        gameFocused: true,
        entries: rank == null ? [] : [entry('game-a', rank)],
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
