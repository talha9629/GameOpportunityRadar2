import fs from 'node:fs';
import path from 'node:path';

const digest = JSON.parse(fs.readFileSync(path.resolve('public/data/research/digest.json'), 'utf8'));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

assert(digest.schemaVersion === 1, 'schemaVersion must be 1');
assert(['complete', 'history_pending'].includes(digest.status), 'invalid digest status');
assert(/^\d{4}-\d{2}-\d{2}$/.test(digest.currentDate ?? ''), 'currentDate invalid');
assert(/^\d{4}-\d{2}-\d{2}$/.test(digest.comparisonDate ?? ''), 'comparisonDate invalid');
assert(typeof digest.statement === 'string' && /does not predict success/i.test(digest.statement), 'digest must disclaim prediction');
assert(Array.isArray(digest.changes), 'changes must be an array');
assert(Array.isArray(digest.states), 'states must be an array');
assert(Array.isArray(digest.limitations) && digest.limitations.some((value) => /history_pending/i.test(value)), 'missing history limitation required');

if (digest.status === 'history_pending') {
  assert(digest.changes.length === 0, 'history_pending digest must not fabricate changes');
}

for (const change of digest.changes ?? []) {
  assert(typeof change.type === 'string' && change.type.length > 3, 'change type missing');
  assert(typeof change.appId === 'string' && change.appId.length >= 5, `change ${change.type} appId invalid`);
  assert(['info', 'attention'].includes(change.significance), `change ${change.type} significance invalid`);
  assert(Array.isArray(change.evidence) && change.evidence.length > 0, `change ${change.type} has no evidence`);
  assert(!/success probability|estimated downloads from rank|revenue from rank/i.test(JSON.stringify(change)), `change ${change.type} contains unsafe inference`);
}

const allowedStates = new Set(['INSUFFICIENT_HISTORY', 'PERSISTING_3D', 'PERSISTING_7D', 'RISING_EXACT_3D', 'FALLING_EXACT_3D', 'FLAT_EXACT_3D']);
for (const state of digest.states ?? []) {
  assert(allowedStates.has(state.state), `invalid lifecycle state ${state.state}`);
  assert(typeof state.evidence === 'string' && state.evidence.length >= 10, `state ${state.appId} missing evidence`);
  if (/RISING|FALLING|FLAT/.test(state.state)) assert(/exact 3d/i.test(state.evidence), `directional state ${state.appId} must cite exact 3d evidence`);
}

assert(digest.summary?.changeCount === digest.changes.length, 'changeCount mismatch');
assert(digest.summary?.attentionCount === digest.changes.filter((change) => change.significance === 'attention').length, 'attentionCount mismatch');

if (errors.length) {
  console.error('[research-digest] validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`[research-digest] validation PASS · ${digest.status} · ${digest.changes.length} changes · ${digest.states.length} states`);
