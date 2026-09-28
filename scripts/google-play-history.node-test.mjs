import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isExactSuccessfulGooglePlaySnapshot,
  selectLatestSuccessfulGooglePlaySnapshot,
  unconfiguredStateIsSemanticallyUnchanged,
} from './google-play-history.mjs';

function success(generatedAt, prefix = 'pkg') {
  return {
    status: 'ok',
    generatedAt,
    entries: Array.from({ length: 50 }, (_, index) => ({ packageName: `${prefix}.${index}` })),
  };
}

test('recognizes only exact successful snapshots with unique packages', () => {
  assert.equal(isExactSuccessfulGooglePlaySnapshot(success('2026-09-27T04:25:00Z')), true);
  assert.equal(isExactSuccessfulGooglePlaySnapshot({ ...success('2026-09-27T04:25:00Z'), entries: [] }), false);
  const duplicate = success('2026-09-27T04:25:00Z');
  duplicate.entries[49].packageName = duplicate.entries[0].packageName;
  assert.equal(isExactSuccessfulGooglePlaySnapshot(duplicate), false);
});

test('recovers latest successful history when latest provider state is unconfigured', () => {
  const older = success('2026-09-25T04:25:00Z', 'older');
  const newest = success('2026-09-27T04:25:00Z', 'newest');
  const latest = { status: 'unconfigured', generatedAt: '2026-09-28T04:25:00Z', entries: [] };
  assert.equal(selectLatestSuccessfulGooglePlaySnapshot(latest, [older, newest]), newest);
});

test('uses a same-day successful history snapshot after a later failed latest state', () => {
  const sameDaySuccess = success('2026-09-28T04:25:00Z');
  const failedLatest = { status: 'failed', generatedAt: '2026-09-28T05:00:00Z', entries: [] };
  assert.equal(selectLatestSuccessfulGooglePlaySnapshot(failedLatest, [sameDaySuccess]), sameDaySuccess);
});

test('unconfigured no-op comparison ignores generatedAt but not evidence state', () => {
  const previous = {
    status: 'unconfigured',
    generatedAt: '2026-09-27T04:25:00Z',
    previousSuccessfulAt: null,
    entries: [],
  };
  const sameMeaning = { ...previous, generatedAt: '2026-09-28T04:25:00Z' };
  assert.equal(unconfiguredStateIsSemanticallyUnchanged(previous, sameMeaning), true);
  assert.equal(unconfiguredStateIsSemanticallyUnchanged(previous, { ...sameMeaning, previousSuccessfulAt: '2026-09-26T04:25:00Z' }), false);
});
