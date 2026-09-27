import fs from 'node:fs';
import path from 'node:path';

const health = JSON.parse(fs.readFileSync(path.resolve('public/data/health/latest.json'), 'utf8'));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

assert(health.schemaVersion === 1, 'schemaVersion must be 1');
assert(['ready', 'ready_with_maturing_history', 'degraded', 'blocked'].includes(health.overall), 'invalid overall health');
assert(typeof health.generatedAt === 'string' && !Number.isNaN(Date.parse(health.generatedAt)), 'generatedAt invalid');
assert(typeof health.statement === 'string' && /does not score game opportunities/i.test(health.statement), 'health statement must reject opportunity scoring');
assert(Array.isArray(health.components) && health.components.length >= 9, 'health components missing');
assert(Array.isArray(health.recommendedActions), 'recommendedActions must be an array');

const allowedStates = new Set(['healthy', 'degraded', 'blocked', 'maturing', 'optional']);
for (const item of health.components ?? []) {
  assert(typeof item.id === 'string' && item.id.length > 2, 'component id missing');
  assert(allowedStates.has(item.state), `invalid state for ${item.id}`);
  assert(Array.isArray(item.facts) && item.facts.length > 0, `${item.id} has no facts`);
}
const ids = new Set(health.components.map((item) => item.id));
for (const required of ['apple_radar', 'trend_signals', 'research_queue', 'verification_queue', 'gameplay_discovery', 'history_maturity', 'research_digest', 'policy_watch', 'appbrain']) {
  assert(ids.has(required), `missing required health component ${required}`);
}

const essentialIds = new Set(['apple_radar', 'trend_signals', 'research_queue', 'verification_queue', 'policy_watch']);
const essential = health.components.filter((item) => essentialIds.has(item.id));
assert(health.essentialCount === essential.length, 'essentialCount mismatch');
assert(health.essentialCount === 5, 'trend signals must be part of the 5 essential pipelines');
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
assert(Number.isInteger(health.facts?.trendSignalCount) && health.facts.trendSignalCount >= 0, 'trendSignalCount invalid');
assert(Number.isInteger(health.facts?.trendExpectedSignalCount) && health.facts.trendExpectedSignalCount >= 0, 'trendExpectedSignalCount invalid');
assert(Number.isInteger(health.facts?.trendHealthyMarketCount) && health.facts.trendHealthyMarketCount >= 0, 'trendHealthyMarketCount invalid');
assert(Number.isInteger(health.facts?.trendExpectedMarketCount) && health.facts.trendExpectedMarketCount >= 0, 'trendExpectedMarketCount invalid');
assert(typeof health.facts?.trendDerivedFromCurrentRadar === 'boolean', 'trendDerivedFromCurrentRadar invalid');
assert(typeof health.facts?.trendChartDepthMatches === 'boolean', 'trendChartDepthMatches invalid');
assert(health.facts?.trendStateCounts && typeof health.facts.trendStateCounts === 'object' && !Array.isArray(health.facts.trendStateCounts), 'trendStateCounts invalid');
assert(Number.isInteger(health.facts?.verificationTaskCount) && health.facts.verificationTaskCount >= 0, 'verificationTaskCount invalid');
assert(Number.isInteger(health.facts?.verificationRawTaskCount) && health.facts.verificationRawTaskCount >= 0, 'verificationRawTaskCount invalid');
assert(Number.isInteger(health.facts?.verificationOmittedTaskCount) && health.facts.verificationOmittedTaskCount >= 0, 'verificationOmittedTaskCount invalid');
assert(Number.isInteger(health.facts?.verificationCaptureSessionCount) && health.facts.verificationCaptureSessionCount >= 0 && health.facts.verificationCaptureSessionCount <= 8, 'verificationCaptureSessionCount invalid');
assert(Number.isInteger(health.facts?.verificationGroupedEvidenceTaskCount) && health.facts.verificationGroupedEvidenceTaskCount >= 0, 'verificationGroupedEvidenceTaskCount invalid');
assert(health.facts.verificationGroupedEvidenceTaskCount <= health.facts.verificationTaskCount, 'grouped evidence tasks cannot exceed atomic verification tasks');
assert(health.facts.verificationGroupedEvidenceTaskCount === 0 || health.facts.verificationCaptureSessionCount > 0, 'grouped evidence tasks require at least one capture session');
assert(typeof health.facts?.verificationDerivedFromCurrentQueue === 'boolean', 'verificationDerivedFromCurrentQueue invalid');
assert(typeof health.facts?.gameplayDiscoveryConfigured === 'boolean', 'gameplayDiscoveryConfigured invalid');
assert(['tavily', 'gemini_google_search', 'none'].includes(health.facts?.gameplayDiscoveryProvider), 'gameplayDiscoveryProvider invalid');
assert(Number.isInteger(health.facts?.gameplayDiscoveryCandidateCount) && health.facts.gameplayDiscoveryCandidateCount >= 0 && health.facts.gameplayDiscoveryCandidateCount <= 24, 'gameplayDiscoveryCandidateCount invalid');
assert(Number.isInteger(health.facts?.gameplayDiscoveryRequestsUsed) && health.facts.gameplayDiscoveryRequestsUsed >= 0 && health.facts.gameplayDiscoveryRequestsUsed <= 8, 'gameplayDiscoveryRequestsUsed invalid');
assert(Number.isInteger(health.facts?.gameplayDiscoverySearchQueriesUsed) && health.facts.gameplayDiscoverySearchQueriesUsed >= 0, 'gameplayDiscoverySearchQueriesUsed invalid');
assert(typeof health.facts?.gameplayDiscoveryDerivedFromCurrentVerification === 'boolean', 'gameplayDiscoveryDerivedFromCurrentVerification invalid');
assert(typeof health.facts?.appBrainConfigured === 'boolean', 'appBrainConfigured invalid');

const trendComponent = health.components.find((item) => item.id === 'trend_signals');
if (trendComponent?.state === 'healthy') {
  assert(health.facts.trendDerivedFromCurrentRadar === true, 'healthy trend signals must derive from current Radar');
  assert(health.facts.trendChartDepthMatches === true, 'healthy trend signals must match Radar chart depth');
  assert(health.facts.trendSignalCount === health.facts.trendExpectedSignalCount, 'healthy trend signals must cover every current chart row');
  assert(health.facts.trendHealthyMarketCount === health.facts.trendExpectedMarketCount, 'healthy trend signals must cover every healthy Games market');
}
assert(trendComponent?.facts?.some((fact) => /not downloads, revenue, market share, probability, or a build recommendation/i.test(fact)), 'trend health must expose the rank-only evidence boundary');

const verificationComponent = health.components.find((item) => item.id === 'verification_queue');
if (verificationComponent?.state === 'healthy') {
  assert(health.facts.verificationDerivedFromCurrentQueue === true, 'healthy verification queue must be derived from current research queue');
  assert(health.facts.verificationOmittedTaskCount === 0, 'healthy verification queue cannot omit explicit unknowns');
  assert(health.facts.verificationTaskCount === health.facts.verificationRawTaskCount, 'healthy verification queue must route every raw task');
  assert(health.facts.verificationGroupedEvidenceTaskCount === 0 || health.facts.verificationCaptureSessionCount > 0, 'healthy grouped verification coverage needs capture sessions');
  assert(verificationComponent.facts.some((fact) => /capture session\(s\) cover .* gameplay evidence task\(s\)/i.test(fact)), 'healthy verification component must expose grouped session coverage');
}

const discoveryComponent = health.components.find((item) => item.id === 'gameplay_discovery');
if (discoveryComponent?.state === 'healthy') {
  assert(health.facts.gameplayDiscoveryConfigured === true, 'healthy gameplay discovery must be configured');
  assert(health.facts.gameplayDiscoveryProvider !== 'none', 'healthy gameplay discovery must identify a configured provider');
  assert(health.facts.gameplayDiscoveryDerivedFromCurrentVerification === true, 'healthy gameplay discovery must match the current verification queue');
}
if (discoveryComponent?.state === 'optional') {
  assert(health.facts.gameplayDiscoveryConfigured === false, 'optional gameplay discovery should represent an unconfigured provider');
  assert(health.facts.gameplayDiscoveryProvider === 'none', 'optional gameplay discovery should identify no configured provider');
  assert(health.facts.gameplayDiscoveryRequestsUsed === 0, 'unconfigured gameplay discovery cannot consume requests');
  assert(health.facts.gameplayDiscoverySearchQueriesUsed === 0, 'unconfigured gameplay discovery cannot report search queries');
}
assert(discoveryComponent?.facts?.some((fact) => /not verified gameplay evidence/i.test(fact)), 'gameplay discovery must expose the search-candidate evidence boundary');
assert(discoveryComponent?.facts?.some((fact) => /provider request cap used/i.test(fact)), 'gameplay discovery must expose provider request usage');
assert(discoveryComponent?.facts?.some((fact) => /search quer/i.test(fact)), 'gameplay discovery must expose provider-reported search query usage');
assert(!/success probability|revenue estimate from rank|downloads? from rank/i.test(JSON.stringify(health)), 'health report contains unsafe inference');

if (errors.length) {
  console.error('[data-health] validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`[data-health] validation PASS · ${health.overall} · ${health.essentialHealthy}/${health.essentialCount} essential healthy · trends ${health.facts.trendSignalCount}/${health.facts.trendExpectedSignalCount} · verification ${health.facts.verificationTaskCount}/${health.facts.verificationRawTaskCount}, omitted ${health.facts.verificationOmittedTaskCount} · discovery ${health.facts.gameplayDiscoveryProvider} ${health.facts.gameplayDiscoveryCandidateCount} candidate(s), ${health.facts.gameplayDiscoveryRequestsUsed} request(s), ${health.facts.gameplayDiscoverySearchQueriesUsed} search query/queries · sessions ${health.facts.verificationCaptureSessionCount}/${health.facts.verificationGroupedEvidenceTaskCount} grouped task(s) · ${health.recommendedActions.length} action(s)`);
