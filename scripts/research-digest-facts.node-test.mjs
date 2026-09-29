import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDigestCandidateSnapshot, exactComparisonAvailableEventType } from './research-digest-facts.mjs';

test('digest preserves authoritative insufficient trend even with strong exact 3d movement', () => {
  const snapshot = buildDigestCandidateSnapshot({
    appId: '1234567890',
    name: 'Example',
    queueRank: 1,
    researchPriority: 70,
    evidence: {
      maxObservedDays: 4,
      exactWindows: { '3d': { status: 'available', bestUpwardDelta: 38 } },
      trend: {
        state: 'INSUFFICIENT_DATA',
        rationale: ['Only 4/7 consecutive exact daily snapshots are available.'],
        consecutiveHistoryDays: 4,
        minimumConsecutiveHistoryDays: 7,
      },
    },
  });

  assert.equal(snapshot.trendState, 'INSUFFICIENT_DATA');
  assert.equal(snapshot.exact3dMovement.status, 'available');
  assert.equal(snapshot.exact3dMovement.bestUpwardDelta, 38);
  assert.equal(snapshot.consecutiveHistoryDays, 4);
  assert.equal(snapshot.minimumConsecutiveHistoryDays, 7);
});

test('comparison availability events do not use maturity terminology', () => {
  assert.equal(exactComparisonAvailableEventType(3), 'EXACT_3D_COMPARISON_AVAILABLE');
  assert.equal(exactComparisonAvailableEventType(7), 'EXACT_7D_COMPARISON_AVAILABLE');
  assert.throws(() => exactComparisonAvailableEventType(1));
});
