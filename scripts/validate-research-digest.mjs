import fs from 'node:fs';
import path from 'node:path';

const digest = JSON.parse(fs.readFileSync(path.resolve('public/data/research/digest.json'), 'utf8'));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

function onlyNewEntryReasons(change) {
  const added = Array.isArray(change.reasonCodesAdded) ? change.reasonCodesAdded : [];
  const removed = Array.isArray(change.reasonCodesRemoved) ? change.reasonCodesRemoved : [];
  const changed = [...added, ...removed];
  return changed.length > 0 && changed.every((reason) => /^NEW_ENTRY_TOP_(10|20)$/.test(reason));
}
function hasStrongOneDayReason(change) {
  return Array.isArray(change.reasonCodes) && change.reasonCodes.some((reason) => /^UP_(8|15)_PLUS_1D$/.test(reason));
}

assert(digest.schemaVersion === 1, 'schemaVersion must be 1');
assert(['complete', 'history_pending'].includes(digest.status), 'invalid digest status');
assert(/^\d{4}-\d{2}-\d{2}$/.test(digest.currentDate ?? ''), 'currentDate invalid');
assert(/^\d{4}-\d{2}-\d{2}$/.test(digest.comparisonDate ?? ''), 'comparisonDate invalid');
assert(typeof digest.statement === 'string' && /does not predict success/i.test(digest.statement), 'digest must disclaim prediction');
assert(typeof digest.statement === 'string' && /attention is reserved/i.test(digest.statement), 'digest must define attention as interruption-worthy evidence change');
assert(Array.isArray(digest.changes), 'changes must be an array');
assert(Array.isArray(digest.states), 'states must be an array');
assert(Array.isArray(digest.limitations) && digest.limitations.some((value) => /history_pending/i.test(value)), 'missing history limitation required');
assert(digest.limitations.some((value) => /NEW_ENTRY bonus expiring/i.test(value)), 'digest must document NEW_ENTRY lifecycle normalization');
assert(digest.limitations.some((value) => /top-12 triage churn/i.test(value)), 'digest must document bounded queue churn');

if (digest.status === 'history_pending') {
  assert(digest.changes.length === 0, 'history_pending digest must not fabricate changes');
}

for (const change of digest.changes ?? []) {
  assert(typeof change.type === 'string' && change.type.length > 3, 'change type missing');
  assert(typeof change.appId === 'string' && change.appId.length >= 5, `change ${change.type} appId invalid`);
  assert(['info', 'attention'].includes(change.significance), `change ${change.type} significance invalid`);
  assert(typeof change.significanceReason === 'string' && change.significanceReason.length >= 20, `change ${change.type} significanceReason missing`);
  assert(Array.isArray(change.evidence) && change.evidence.length > 0, `change ${change.type} has no evidence`);
  assert(!/success probability|estimated downloads from rank|revenue from rank/i.test(JSON.stringify(change)), `change ${change.type} contains unsafe inference`);

  if (change.type === 'PRIORITY_INCREASED' || change.type === 'PRIORITY_DECREASED') {
    assert(Number.isInteger(change.previous) && change.previous >= 0 && change.previous <= 100, `${change.type} previous priority invalid`);
    assert(Number.isInteger(change.current) && change.current >= 0 && change.current <= 100, `${change.type} current priority invalid`);
    assert(Number.isInteger(change.delta) && change.delta === change.current - change.previous, `${change.type} delta mismatch`);
    assert(Math.abs(change.delta) >= 10, `${change.type} must meet the 10-point reporting threshold`);
    assert(Array.isArray(change.reasonCodesAdded), `${change.type} reasonCodesAdded missing`);
    assert(Array.isArray(change.reasonCodesRemoved), `${change.type} reasonCodesRemoved missing`);
    assert(change.evidence.some((value) => /deterministic research priority changed/i.test(value)), `${change.type} must state the observed deterministic priority change`);
    assert(change.evidence.some((value) => /priority delta/i.test(value)), `${change.type} must state the numeric priority delta`);
    if (onlyNewEntryReasons(change)) {
      assert(change.significance === 'info', `${change.type} with only NEW_ENTRY reason expiry must be informational`);
      assert(/NEW_ENTRY|one-day/i.test(change.significanceReason), `${change.type} lifecycle-normalization reason must be explicit`);
    } else {
      assert(change.significance === 'attention', `${change.type} with non-NEW_ENTRY reason changes must remain attention`);
    }
  }

  if (change.type === 'NEW_TO_RESEARCH_QUEUE') {
    assert(Number.isInteger(change.queueRank) && change.queueRank >= 1 && change.queueRank <= 12, 'new queue candidate must carry queueRank');
    assert(Number.isInteger(change.researchPriority) && change.researchPriority >= 0 && change.researchPriority <= 100, 'new queue candidate must carry researchPriority');
    assert(Array.isArray(change.reasonCodes), 'new queue candidate must carry reasonCodes');
    const shouldInterrupt = change.queueRank <= 3 || hasStrongOneDayReason(change);
    assert(change.significance === (shouldInterrupt ? 'attention' : 'info'), `NEW_TO_RESEARCH_QUEUE significance contradicts top-three/strong-1d rule for ${change.appId}`);
  }

  if (change.type === 'DROPPED_FROM_RESEARCH_QUEUE') {
    assert(Number.isInteger(change.previousQueueRank) && change.previousQueueRank >= 1 && change.previousQueueRank <= 12, 'dropped candidate must carry previousQueueRank');
    assert(Number.isInteger(change.previousResearchPriority) && change.previousResearchPriority >= 0 && change.previousResearchPriority <= 100, 'dropped candidate must carry previousResearchPriority');
    const shouldInterrupt = change.previousQueueRank <= 3;
    assert(change.significance === (shouldInterrupt ? 'attention' : 'info'), `DROPPED_FROM_RESEARCH_QUEUE significance contradicts prior-top-three rule for ${change.appId}`);
  }

  if (change.type === 'CROSS_MARKET_EXPANDED' || change.type === 'CROSS_MARKET_CONTRACTED') {
    assert(change.significance === 'attention', `${change.type} must remain attention`);
  }
  if (/^EXACT_[37]D_HISTORY_MATURED$/.test(change.type)) {
    assert(change.significance === 'attention', `${change.type} must remain attention`);
  }
  if (change.type === 'BEST_RANK_IMPROVED' || change.type === 'BEST_RANK_DECLINED') {
    assert(change.significance === 'info', `${change.type} must remain informational context`);
  }
}

const allowedStates = new Set(['INSUFFICIENT_HISTORY', 'PERSISTING_3D', 'PERSISTING_7D', 'RISING_EXACT_3D', 'FALLING_EXACT_3D', 'FLAT_EXACT_3D']);
for (const state of digest.states ?? []) {
  assert(allowedStates.has(state.state), `invalid lifecycle state ${state.state}`);
  assert(typeof state.evidence === 'string' && state.evidence.length >= 10, `state ${state.appId} missing evidence`);
  if (/RISING|FALLING|FLAT/.test(state.state)) assert(/exact 3d/i.test(state.evidence), `directional state ${state.appId} must cite exact 3d evidence`);
  if (/PERSISTING_[37]D/.test(state.state)) assert(/consecutive day/i.test(state.evidence), `persistence state ${state.appId} must cite consecutive-day evidence`);
}

assert(digest.summary?.changeCount === digest.changes.length, 'changeCount mismatch');
assert(digest.summary?.attentionCount === digest.changes.filter((change) => change.significance === 'attention').length, 'attentionCount mismatch');
assert(digest.summary?.informationalCount === digest.changes.filter((change) => change.significance === 'info').length, 'informationalCount mismatch');
assert(digest.summary?.changeCount === digest.summary.attentionCount + digest.summary.informationalCount, 'attention + informational must equal changeCount');

if (errors.length) {
  console.error('[research-digest] validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`[research-digest] validation PASS · ${digest.status} · ${digest.changes.length} changes · ${digest.summary.attentionCount} attention · ${digest.summary.informationalCount} informational · ${digest.states.length} states`);
