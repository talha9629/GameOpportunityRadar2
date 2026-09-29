import fs from 'node:fs';
import path from 'node:path';
import { MIN_TREND_HISTORY_DAYS } from './trend-state.mjs';

const digest = JSON.parse(fs.readFileSync(path.resolve('public/data/research/digest.json'), 'utf8'));
const queue = JSON.parse(fs.readFileSync(path.resolve('public/data/research/latest.json'), 'utf8'));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const queueById = new Map((queue.candidates ?? []).map((candidate) => [String(candidate.appId), candidate]));
const allowedTrendStates = new Set(['INSUFFICIENT_DATA', 'EMERGING', 'RISING', 'ESTABLISHED', 'DECLINING']);
const allowedWindowStates = new Set(['available', 'history_missing', 'not_ranked', 'market_failed', 'source_mismatch', 'coverage_gap']);

assert(digest.schemaVersion === 2, 'schemaVersion must be 2');
assert(['complete', 'history_pending'].includes(digest.status), 'invalid digest status');
assert(/^\d{4}-\d{2}-\d{2}$/.test(digest.currentDate ?? ''), 'currentDate invalid');
assert(/^\d{4}-\d{2}-\d{2}$/.test(digest.comparisonDate ?? ''), 'comparisonDate invalid');
assert(digest.currentDate === queue.radarDate, 'digest must derive from the current research queue');
assert(typeof digest.statement === 'string' && /does not predict success/i.test(digest.statement), 'digest must disclaim prediction');
assert(/independent trend classification/i.test(digest.statement), 'digest must reject independent trend classification');
assert(Array.isArray(digest.changes), 'changes must be an array');
assert(Array.isArray(digest.candidateSnapshots), 'candidateSnapshots must be an array');
assert(!Object.hasOwn(digest, 'states'), 'legacy independent lifecycle states must not be emitted');
assert(Array.isArray(digest.limitations) && digest.limitations.some((value) => /history_pending/i.test(value)), 'missing history limitation required');
assert(digest.limitations.some((value) => /comparison.*not a history-maturity event/i.test(value)), 'comparison availability must be distinguished from maturity');
assert(digest.limitations.some((value) => /7-consecutive-exact-day gate/i.test(value)), 'seven-day maturity limitation required');

if (digest.status === 'history_pending') {
  assert(digest.changes.length === 0, 'history_pending digest must not fabricate changes');
}

for (const change of digest.changes ?? []) {
  assert(typeof change.type === 'string' && change.type.length > 3, 'change type missing');
  assert(typeof change.appId === 'string' && change.appId.length >= 5, `change ${change.type} appId invalid`);
  assert(['info', 'attention'].includes(change.significance), `change ${change.type} significance invalid`);
  assert(Array.isArray(change.evidence) && change.evidence.length > 0, `change ${change.type} has no evidence`);
  assert(!/success probability|estimated downloads from rank|revenue from rank/i.test(JSON.stringify(change)), `change ${change.type} contains unsafe inference`);
  assert(!/HISTORY_MATURED/.test(change.type), `${change.type} uses obsolete maturity terminology`);

  if (change.iconUrl !== undefined) assert(change.iconUrl == null || typeof change.iconUrl === 'string', `${change.type} iconUrl invalid`);
  if (change.publisher !== undefined) assert(change.publisher == null || typeof change.publisher === 'string', `${change.type} publisher invalid`);
  for (const key of ['previousQueueRank', 'currentQueueRank', 'previousBestRank', 'currentBestRank']) {
    if (change[key] !== undefined && change[key] !== null) assert(Number.isInteger(change[key]) && change[key] > 0, `${change.type} ${key} invalid`);
  }
  for (const key of ['previousMarketCount', 'currentMarketCount']) {
    if (change[key] !== undefined && change[key] !== null) assert(Number.isInteger(change[key]) && change[key] >= 0 && change[key] <= 4, `${change.type} ${key} invalid`);
  }

  if (change.type === 'PRIORITY_INCREASED' || change.type === 'PRIORITY_DECREASED') {
    assert(Number.isInteger(change.previous) && change.previous >= 0 && change.previous <= 100, `${change.type} previous priority invalid`);
    assert(Number.isInteger(change.current) && change.current >= 0 && change.current <= 100, `${change.type} current priority invalid`);
    assert(Number.isInteger(change.delta) && change.delta === change.current - change.previous, `${change.type} delta mismatch`);
    assert(Math.abs(change.delta) >= 10, `${change.type} must meet the 10-point reporting threshold`);
    assert(Array.isArray(change.reasonCodesAdded), `${change.type} reasonCodesAdded missing`);
    assert(Array.isArray(change.reasonCodesRemoved), `${change.type} reasonCodesRemoved missing`);
  }

  if (/^EXACT_[37]D_COMPARISON_AVAILABLE$/.test(change.type)) {
    assert(change.evidence.some((value) => /comparison is now available/i.test(value)), `${change.type} must describe comparison availability`);
    if (change.type === 'EXACT_3D_COMPARISON_AVAILABLE') {
      assert(change.evidence.some((value) => /not proof.*7-day trend-history maturity gate/i.test(value)), '3d comparison event must reject maturity inference');
    }
  }
}

assert(digest.candidateSnapshots.length === (queue.candidates ?? []).length, 'candidate snapshot count must match current queue');
for (const snapshot of digest.candidateSnapshots ?? []) {
  const candidate = queueById.get(String(snapshot.appId));
  assert(Boolean(candidate), `digest candidate snapshot ${snapshot.appId} missing from current queue`);
  if (!candidate) continue;
  assert(snapshot.name === candidate.name, `${snapshot.appId} snapshot name mismatch`);
  assert(snapshot.queueRank === candidate.queueRank, `${snapshot.appId} queueRank mismatch`);
  assert(snapshot.researchPriority === candidate.researchPriority, `${snapshot.appId} researchPriority mismatch`);
  assert(allowedTrendStates.has(snapshot.trendState), `${snapshot.appId} invalid trend state`);
  assert(snapshot.trendState === candidate.evidence?.trend?.state, `${snapshot.appId} digest trend must copy authoritative research trend`);
  assert(JSON.stringify(snapshot.trendRationale) === JSON.stringify(candidate.evidence?.trend?.rationale ?? []), `${snapshot.appId} trend rationale mismatch`);
  assert(snapshot.consecutiveHistoryDays === candidate.evidence?.trend?.consecutiveHistoryDays, `${snapshot.appId} consecutive history mismatch`);
  assert(snapshot.minimumConsecutiveHistoryDays === candidate.evidence?.trend?.minimumConsecutiveHistoryDays, `${snapshot.appId} minimum history mismatch`);
  assert(snapshot.observedPersistenceDays === candidate.evidence?.maxObservedDays, `${snapshot.appId} observed persistence mismatch`);
  assert(allowedWindowStates.has(snapshot.exact3dMovement?.status), `${snapshot.appId} invalid exact3d movement status`);
  assert(snapshot.exact3dMovement?.status === candidate.evidence?.exactWindows?.['3d']?.status, `${snapshot.appId} exact3d status mismatch`);
  assert(snapshot.exact3dMovement?.bestUpwardDelta === candidate.evidence?.exactWindows?.['3d']?.bestUpwardDelta, `${snapshot.appId} exact3d delta mismatch`);
  if ((snapshot.consecutiveHistoryDays ?? 0) < MIN_TREND_HISTORY_DAYS) {
    assert(snapshot.trendState === 'INSUFFICIENT_DATA', `${snapshot.appId} cannot carry mature trend before ${MIN_TREND_HISTORY_DAYS} exact days`);
  }
}

assert(digest.summary?.changeCount === digest.changes.length, 'changeCount mismatch');
assert(digest.summary?.attentionCount === digest.changes.filter((change) => change.significance === 'attention').length, 'attentionCount mismatch');
assert(digest.summary?.comparisonAvailabilityEvents === digest.changes.filter((change) => /^EXACT_[37]D_COMPARISON_AVAILABLE$/.test(change.type)).length, 'comparisonAvailabilityEvents mismatch');
assert(!Object.hasOwn(digest.summary ?? {}, 'maturityEvents'), 'legacy maturityEvents summary must not be emitted');

if (errors.length) {
  console.error('[research-digest] validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`[research-digest] validation PASS · ${digest.status} · ${digest.changes.length} changes · ${digest.candidateSnapshots.length} authoritative candidate snapshots`);
