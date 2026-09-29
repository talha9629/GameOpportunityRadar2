import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrend, consecutiveSnapshotDays, MIN_TREND_HISTORY_DAYS } from './trend-state.mjs';

function windows(overrides = {}) {
  return {
    '1d': { status: 'available', delta: 2 },
    '3d': { status: 'available', delta: 8 },
    '7d': { status: 'history_missing', delta: null },
    ...overrides,
  };
}

test('maturity threshold is seven consecutive exact daily snapshots', () => {
  assert.equal(MIN_TREND_HISTORY_DAYS, 7);
  const index = { snapshots: [
    { date: '2026-09-26' },
    { date: '2026-09-27' },
    { date: '2026-09-28' },
    { date: '2026-09-29' },
  ] };
  assert.equal(consecutiveSnapshotDays(index, '2026-09-29'), 4);
});

test('directional 3-day movement stays insufficient before seven-day maturity', () => {
  const trend = assessTrend({ rank: 12, daysObserved: 4 }, windows(), 4);
  assert.equal(trend.state, 'INSUFFICIENT_DATA');
  assert.deepEqual(trend.evidenceDays, []);
  assert.match(trend.reason, /4\/7 consecutive exact daily snapshots/i);
});

test('emerging absence stays insufficient before seven-day maturity', () => {
  const trend = assessTrend(
    { rank: 8, daysObserved: 4 },
    windows({ '3d': { status: 'not_ranked', delta: null } }),
    4,
  );
  assert.equal(trend.state, 'INSUFFICIENT_DATA');
});

test('directional state can activate after seven-day maturity when exact gate is met', () => {
  const trend = assessTrend({ rank: 12, daysObserved: 7 }, windows(), 7);
  assert.equal(trend.state, 'RISING');
  assert.deepEqual(trend.evidenceDays, [3]);
});

test('missing calendar date breaks maturity continuity', () => {
  const index = { snapshots: [
    { date: '2026-09-23' },
    { date: '2026-09-24' },
    { date: '2026-09-26' },
    { date: '2026-09-27' },
    { date: '2026-09-28' },
    { date: '2026-09-29' },
  ] };
  assert.equal(consecutiveSnapshotDays(index, '2026-09-29'), 4);
});
