import fs from 'node:fs';
import path from 'node:path';

const health = JSON.parse(fs.readFileSync(path.resolve('public/data/health/latest.json'), 'utf8'));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

assert(health.schemaVersion === 1, 'schemaVersion must be 1');
assert(['ready', 'ready_with_maturing_history', 'degraded', 'blocked'].includes(health.overall), 'invalid overall health');
assert(typeof health.generatedAt === 'string' && !Number.isNaN(Date.parse(health.generatedAt)), 'generatedAt invalid');
assert(typeof health.statement === 'string' && /does not score game opportunities/i.test(health.statement), 'health statement must reject opportunity scoring');
assert(Array.isArray(health.components) && health.components.length >= 5, 'health components missing');
assert(Array.isArray(health.recommendedActions), 'recommendedActions must be an array');

const allowedStates = new Set(['healthy', 'degraded', 'blocked', 'maturing', 'optional']);
for (const item of health.components ?? []) {
  assert(typeof item.id === 'string' && item.id.length > 2, 'component id missing');
  assert(allowedStates.has(item.state), `invalid state for ${item.id}`);
  assert(Array.isArray(item.facts) && item.facts.length > 0, `${item.id} has no facts`);
}
const ids = new Set(health.components.map((item) => item.id));
for (const required of ['apple_radar', 'research_queue', 'history_maturity', 'research_digest', 'policy_watch', 'appbrain']) {
  assert(ids.has(required), `missing required health component ${required}`);
}

const essentialIds = new Set(['apple_radar', 'research_queue', 'policy_watch']);
const essential = health.components.filter((item) => essentialIds.has(item.id));
assert(health.essentialCount === essential.length, 'essentialCount mismatch');
assert(health.essentialHealthy === essential.filter((item) => item.state === 'healthy').length, 'essentialHealthy mismatch');
if (essential.some((item) => item.state === 'blocked')) assert(health.overall === 'blocked', 'blocked essential component must block overall health');
if (!essential.some((item) => item.state === 'blocked') && essential.some((item) => item.state === 'degraded')) assert(health.overall === 'degraded', 'degraded essential component must degrade overall health');

let prior = -Infinity;
for (const action of health.recommendedActions ?? []) {
  assert(Number.isInteger(action.priority), `action ${action.action} priority invalid`);
  assert(action.priority >= prior, 'recommendedActions must be priority sorted');
  prior = action.priority;
  assert(typeof action.action === 'string' && action.action.length > 4, 'action name missing');
  assert(typeof action.why === 'string' && action.why.length >= 12, `action ${action.action} missing factual rationale`);
}

assert(Number.isInteger(health.facts?.exactHistoryDays) && health.facts.exactHistoryDays >= 0, 'exactHistoryDays invalid');
assert(typeof health.facts?.appBrainConfigured === 'boolean', 'appBrainConfigured invalid');
assert(!/success probability|revenue estimate from rank|downloads? from rank/i.test(JSON.stringify(health)), 'health report contains unsafe inference');

if (errors.length) {
  console.error('[data-health] validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`[data-health] validation PASS · ${health.overall} · ${health.essentialHealthy}/${health.essentialCount} essential healthy · ${health.recommendedActions.length} action(s)`);
