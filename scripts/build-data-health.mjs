import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('public/data/health');
const latestPath = path.join(outDir, 'latest.json');
const radar = read('public/data/radar/latest.json');
const radarIndex = read('public/data/radar/index.json');
const queue = read('public/data/research/latest.json');
const digest = read('public/data/research/digest.json');
const policy = read('public/data/policy/index.json');

function read(file) {
  try { return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); }
  catch (error) { return { __readError: String(error) }; }
}
function hoursSince(value, now) {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 3_600_000) : null;
}
function dateOnly(value) { return typeof value === 'string' ? value.slice(0, 10) : null; }
function subtractDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}
function consecutiveDays(index) {
  const dates = new Set((index?.snapshots ?? []).map((item) => item?.date).filter(Boolean));
  const latest = [...dates].sort().at(-1);
  if (!latest) return 0;
  let count = 0;
  while (dates.has(subtractDays(latest, count))) count += 1;
  return count;
}
function component(id, label, state, facts, action = null) {
  return { id, label, state, facts, action };
}

const now = Date.now();
const generatedAt = new Date(now).toISOString();
const radarAgeHours = hoursSince(radar.generatedAt, now);
const healthyMarkets = Object.values(radar.markets ?? {}).filter((market) => market?.status === 'ok' && market?.gameFocused !== false).length;
const fallbackMarkets = Object.values(radar.markets ?? {}).filter((market) => market?.status === 'ok' && market?.gameFocused === false).length;
const failedMarkets = Object.values(radar.markets ?? {}).filter((market) => market?.status === 'failed').length;
const radarState = radar.__readError || radarAgeHours == null || radarAgeHours > 72 || healthyMarkets === 0
  ? 'blocked'
  : radarAgeHours > 36 || failedMarkets > 0 || fallbackMarkets > 0 || radar.runStatus !== 'complete'
    ? 'degraded'
    : 'healthy';

const liveAnalyzer = queue.sources?.liveAnalyzer;
const queueAgeHours = hoursSince(queue.generatedAt, now);
const queueState = queue.__readError || queueAgeHours == null || queueAgeHours > 72 || queue.sources?.appleCharts?.status === 'failed'
  ? 'blocked'
  : queueAgeHours > 36 || queue.sources?.appleLookup?.status !== 'complete' || liveAnalyzer?.status !== 'complete'
    ? 'degraded'
    : 'healthy';

const maturityDays = consecutiveDays(radarIndex);
const historyState = maturityDays >= 7 ? 'healthy' : 'maturing';

const policyAgeHours = hoursSince(policy.generatedAt, now);
const policyFresh = policy.freshCount ?? 0;
const policyFailures = policy.failureCount ?? 0;
const detectedPolicyChanges = (policy.sources ?? []).reduce((sum, source) => sum + (Array.isArray(source?.changes) ? source.changes.length : 0), 0);
const policyState = policy.__readError || policyAgeHours == null || policyAgeHours > 168 || policyFresh === 0
  ? 'blocked'
  : policyAgeHours > 48 || policyFailures > 0 || policy.runStatus !== 'complete'
    ? 'degraded'
    : 'healthy';

const digestState = digest.__readError
  ? 'blocked'
  : digest.status === 'history_pending'
    ? 'maturing'
    : 'healthy';

const appBrainStatus = queue.sources?.appBrain?.status ?? 'unconfigured';
const components = [
  component('apple_radar', 'Apple Games Radar', radarState, [
    `${healthyMarkets}/4 healthy Games markets`,
    `${failedMarkets} failed market(s)`,
    `${fallbackMarkets} overall-chart fallback market(s)`,
    radarAgeHours == null ? 'snapshot age unknown' : `${radarAgeHours.toFixed(1)}h snapshot age`,
  ], radarState === 'healthy' ? null : 'Inspect the latest Apple Radar collection before using rank evidence.'),
  component('research_queue', 'Automated Research Queue', queueState, [
    `${queue.candidates?.length ?? 0} candidates`,
    `Apple lookup ${queue.sources?.appleLookup?.status ?? 'unknown'}`,
    `live evidence ${liveAnalyzer?.status ?? 'not-run'} (${liveAnalyzer?.succeeded ?? 0}/${liveAnalyzer?.attempted ?? 0})`,
    queueAgeHours == null ? 'queue age unknown' : `${queueAgeHours.toFixed(1)}h queue age`,
  ], queueState === 'healthy' ? null : 'Do not promote queue candidates until first-party enrichment returns healthy.'),
  component('history_maturity', 'Exact Rank History', historyState, [
    `${maturityDays}/7 consecutive exact dated snapshot(s)`,
    '1d/3d/7d comparisons never interpolate missing dates',
  ], maturityDays >= 7 ? null : 'Keep scheduled collection running; time is the missing evidence.'),
  component('research_digest', 'Daily Change Digest', digestState, [
    `status ${digest.status ?? 'unknown'}`,
    `${digest.summary?.changeCount ?? 0} exact-date change(s)`,
    `${digest.summary?.attentionCount ?? 0} attention item(s)`,
  ], digest.status === 'history_pending' ? 'Wait for the next exact daily queue; zero changes are intentionally not inferred.' : null),
  component('policy_watch', 'Policy Watch Sources', policyState, [
    `${policyFresh}/${policy.sourceCount ?? 0} fresh official source(s)`,
    `${policyFailures} fetch failure(s)`,
    `${detectedPolicyChanges} detected hash change(s) in retained source history`,
    policyAgeHours == null ? 'policy age unknown' : `${policyAgeHours.toFixed(1)}h policy-index age`,
    'Owner review state is stored in Supabase and is not inferred from this public health report.',
  ], policyState === 'healthy' ? null : 'Inspect Policy Watch source failures/freshness before relying on policy coverage.'),
  component('appbrain', 'AppBrain Estimate Enrichment', appBrainStatus === 'unconfigured' ? 'optional' : appBrainStatus === 'complete' ? 'healthy' : 'degraded', [
    `status ${appBrainStatus}`,
    `${queue.sources?.appBrain?.creditsUsedThisRun ?? 0}/${queue.sources?.appBrain?.dailyCreditCap ?? 10} configured daily credit cap used in latest run`,
    'Third-party estimates never affect first-party research priority.',
  ], appBrainStatus === 'unconfigured' ? 'Optional only: configure APPBRAIN_API_KEY for capped estimate enrichment.' : null),
];

const essential = components.filter((item) => !['appbrain', 'history_maturity', 'research_digest'].includes(item.id));
const blocked = essential.filter((item) => item.state === 'blocked').length;
const degraded = essential.filter((item) => item.state === 'degraded').length;
const overall = blocked > 0 ? 'blocked' : degraded > 0 ? 'degraded' : maturityDays < 7 ? 'ready_with_maturing_history' : 'ready';

const topCandidate = queue.candidates?.[0] ?? null;
const recommendedActions = [];
if (radarState !== 'healthy') recommendedActions.push({ priority: 1, action: 'FIX_RADAR_SOURCE_HEALTH', why: 'Core rank evidence is degraded or blocked.' });
if (queueState !== 'healthy') recommendedActions.push({ priority: 2, action: 'FIX_RESEARCH_ENRICHMENT', why: 'Automated candidate evidence is degraded or blocked.' });
if (topCandidate?.analysisEvidence?.unknowns?.some((value) => /core mechanic has not been gameplay-verified/i.test(value))) {
  recommendedActions.push({ priority: 3, action: 'DEEP_VERIFY_TOP_CANDIDATE', appId: topCandidate.appId, name: topCandidate.name, why: 'The highest-priority candidate still has an explicit gameplay-verification unknown.' });
}
if (maturityDays < 3) recommendedActions.push({ priority: 4, action: 'KEEP_COLLECTING_EXACT_HISTORY', why: `Only ${maturityDays} exact daily snapshot(s) exist; no 3-day direction should be claimed yet.` });
if (appBrainStatus === 'unconfigured') recommendedActions.push({ priority: 9, action: 'OPTIONAL_CONFIGURE_APPBRAIN', why: 'Adds capped third-party estimate context but is not required for first-party triage.' });
recommendedActions.sort((a, b) => a.priority - b.priority);

const output = {
  schemaVersion: 1,
  generatedAt,
  overall,
  statement: 'Data Health reports whether Radar evidence pipelines are usable. It does not score game opportunities or convert missing evidence into confidence.',
  essentialHealthy: essential.filter((item) => item.state === 'healthy').length,
  essentialCount: essential.length,
  components,
  recommendedActions,
  facts: {
    radarDate: dateOnly(radar.generatedAt),
    researchQueueDate: queue.radarDate ?? null,
    exactHistoryDays: maturityDays,
    policyDetectedChangeCount: detectedPolicyChanges,
    appBrainConfigured: appBrainStatus !== 'unconfigured',
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(latestPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`[data-health] ${overall} · essential ${output.essentialHealthy}/${output.essentialCount} healthy · history ${maturityDays}/7 · actions ${recommendedActions.length}`);
