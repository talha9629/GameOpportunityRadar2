import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POLICY_CONFIRMATION_OBSERVATIONS_REQUIRED,
  POLICY_CONFIRMATION_VERSION,
  advancePolicyConfirmation,
  interruptPolicyCandidate,
} from './policy-confirmation.mjs';

const baseline = {
  hash: 'a'.repeat(64),
  path: 'data/policy/snapshots/source/v3/a.json',
  fetchedAt: '2026-09-27T00:00:00.000Z',
  normalizationVersion: 3,
};

function changedRef(at) {
  return {
    hash: 'b'.repeat(64),
    path: 'data/policy/snapshots/source/v3/b.json',
    fetchedAt: at,
    normalizationVersion: 3,
  };
}

test('policy confirmation contract requires three observations', () => {
  assert.equal(POLICY_CONFIRMATION_VERSION, 2);
  assert.equal(POLICY_CONFIRMATION_OBSERVATIONS_REQUIRED, 3);
});

test('a changed hash is not confirmed on the first or second successful observation', () => {
  const firstAt = '2026-09-27T01:00:00.000Z';
  const first = advancePolicyConfirmation({
    sourceId: 'source', current: baseline, pendingCandidate: null,
    fetchedRef: changedRef(firstAt), now: firstAt, normalizationVersion: 3,
  });
  assert.equal(first.confirmedChange, null);
  assert.equal(first.pendingCandidate.observations, 1);

  const secondAt = '2026-09-27T02:30:00.000Z';
  const second = advancePolicyConfirmation({
    sourceId: 'source', current: baseline, pendingCandidate: first.pendingCandidate,
    fetchedRef: changedRef(secondAt), now: secondAt, normalizationVersion: 3,
  });
  assert.equal(second.confirmedChange, null);
  assert.equal(second.pendingCandidate.observations, 2);
});

test('third consecutive successful observation confirms after the stability window', () => {
  const firstAt = '2026-09-27T01:00:00.000Z';
  const first = advancePolicyConfirmation({ sourceId: 'source', current: baseline, pendingCandidate: null, fetchedRef: changedRef(firstAt), now: firstAt, normalizationVersion: 3 });
  const secondAt = '2026-09-27T01:30:00.000Z';
  const second = advancePolicyConfirmation({ sourceId: 'source', current: baseline, pendingCandidate: first.pendingCandidate, fetchedRef: changedRef(secondAt), now: secondAt, normalizationVersion: 3 });
  const thirdAt = '2026-09-27T02:05:00.000Z';
  const third = advancePolicyConfirmation({ sourceId: 'source', current: baseline, pendingCandidate: second.pendingCandidate, fetchedRef: changedRef(thirdAt), now: thirdAt, normalizationVersion: 3 });

  assert.equal(third.pendingCandidate, null);
  assert.equal(third.confirmedChange.observations, 3);
  assert.equal(third.confirmedChange.observationTimestamps.length, 3);
  assert.equal(third.confirmedChange.consecutiveSuccessfulObservations, true);
});

test('a fetch failure breaks candidate continuity', () => {
  const firstAt = '2026-09-27T01:00:00.000Z';
  const first = advancePolicyConfirmation({ sourceId: 'source', current: baseline, pendingCandidate: null, fetchedRef: changedRef(firstAt), now: firstAt, normalizationVersion: 3 });
  const interrupted = interruptPolicyCandidate(first.pendingCandidate, '2026-09-27T01:20:00.000Z', 'fetch_failure');
  assert.equal(interrupted.pendingCandidate, null);
  assert.equal(interrupted.interruption.reason, 'fetch_failure');
  assert.equal(interrupted.interruption.observations, 1);
});

test('baseline reappearance clears the pending candidate without confirming', () => {
  const firstAt = '2026-09-27T01:00:00.000Z';
  const first = advancePolicyConfirmation({ sourceId: 'source', current: baseline, pendingCandidate: null, fetchedRef: changedRef(firstAt), now: firstAt, normalizationVersion: 3 });
  const result = advancePolicyConfirmation({
    sourceId: 'source', current: baseline, pendingCandidate: first.pendingCandidate,
    fetchedRef: { ...baseline, fetchedAt: '2026-09-27T01:30:00.000Z' }, now: '2026-09-27T01:30:00.000Z', normalizationVersion: 3,
  });
  assert.equal(result.pendingCandidate, null);
  assert.equal(result.confirmedChange, null);
  assert.equal(result.interruption.reason, 'baseline_reappeared');
});
