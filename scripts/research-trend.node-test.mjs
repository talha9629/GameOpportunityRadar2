import test from 'node:test';
import assert from 'node:assert/strict';
import { applyResearchTrendMaturity } from './research-trend.mjs';

const rising = {
  state: 'RISING',
  basis: 'exact_rank_history_v1',
  comparable3dMarkets: 2,
  comparable7dMarkets: 0,
  newlyEntered3dMarkets: 0,
  coverageGap3dMarkets: 0,
  median3dDelta: 10,
  median7dDelta: null,
  rationale: ['Median exact 3-day rank move is +10 across 2 comparable market(s).'],
};

test('aggregate directional state is suppressed before seven consecutive exact days', () => {
  const result = applyResearchTrendMaturity(rising, 4);
  assert.equal(result.state, 'INSUFFICIENT_DATA');
  assert.equal(result.consecutiveHistoryDays, 4);
  assert.equal(result.minimumConsecutiveHistoryDays, 7);
  assert.equal(result.median3dDelta, 10);
  assert.match(result.rationale[0], /4\/7 consecutive exact daily snapshots/i);
  assert.match(result.rationale[0], /movement facts may still order research work/i);
});

test('aggregate directional state may pass through after seven consecutive exact days', () => {
  const result = applyResearchTrendMaturity(rising, 7);
  assert.equal(result.state, 'RISING');
  assert.equal(result.consecutiveHistoryDays, 7);
  assert.equal(result.minimumConsecutiveHistoryDays, 7);
});
