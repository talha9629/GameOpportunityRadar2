import fs from 'node:fs';
import path from 'node:path';

const healthPath = path.resolve('public/data/health/latest.json');
const radarPath = path.resolve('public/data/radar/latest.json');
const trendsPath = path.resolve('public/data/radar/trend-signals.json');

function read(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { return { __readError: String(error) }; }
}

function hoursSince(value, now) {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 3_600_000) : null;
}

const health = read(healthPath);
const radar = read(radarPath);
const trends = read(trendsPath);
const now = Date.now();

if (health.__readError) throw new Error(`Data Health must be generated before trend augmentation: ${health.__readError}`);

const healthyRadarMarkets = Object.values(radar.markets ?? {}).filter((market) => market?.status === 'ok' && market?.gameFocused === true);
const expectedSignalCount = healthyRadarMarkets.reduce((sum, market) => sum + (Array.isArray(market.entries) ? market.entries.length : 0), 0);
const expectedMarketCount = healthyRadarMarkets.length;
const trendAgeHours = hoursSince(trends.generatedAt, now);
const derivedFromCurrentRadar = !trends.__readError
  && trends.radarGeneratedAt === radar.generatedAt
  && trends.radarDate === String(radar.generatedAt ?? '').slice(0, 10);
const signalCount = Number.isInteger(trends.summary?.signalCount) ? trends.summary.signalCount : null;
const healthyTrendMarkets = Number.isInteger(trends.summary?.healthyGameMarkets) ? trends.summary.healthyGameMarkets : null;
const chartDepthMatches = Number.isInteger(trends.chartDepth)
  && Number.isInteger(radar.chartDepth)
  && trends.chartDepth === radar.chartDepth;
const countsComplete = signalCount === expectedSignalCount && healthyTrendMarkets === expectedMarketCount;
const semanticBoundaryPresent = typeof trends.statement === 'string'
  && /not download share/i.test(trends.statement)
  && /not.*build recommendation/i.test(trends.statement)
  && Array.isArray(trends.method?.statesReservedForOtherEvidence)
  && trends.method.statesReservedForOtherEvidence.includes('CROWDED')
  && trends.method.statesReservedForOtherEvidence.includes('WINDOW_CLOSING');

const trendState = trends.__readError
  || trendAgeHours == null
  || trendAgeHours > 72
  || !derivedFromCurrentRadar
  || !countsComplete
  || !chartDepthMatches
  || !semanticBoundaryPresent
    ? 'blocked'
    : trendAgeHours > 36
      ? 'degraded'
      : 'healthy';

const stateCounts = trends.summary?.stateCounts ?? {};
const stateSummary = Object.entries(stateCounts)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([state, count]) => `${state} ${count}`)
  .join(' · ') || 'no trend states';

const component = {
  id: 'trend_signals',
  label: 'Exact-Date Trend Signals',
  state: trendState,
  facts: [
    `${signalCount ?? 0}/${expectedSignalCount} current chart signal(s)`,
    `${healthyTrendMarkets ?? 0}/${expectedMarketCount} healthy Games market(s) represented`,
    chartDepthMatches ? `chart depth matches Top ${radar.chartDepth}` : `chart-depth mismatch: Radar ${radar.chartDepth ?? 'unknown'} vs Trends ${trends.chartDepth ?? 'unknown'}`,
    derivedFromCurrentRadar ? 'derived from current Apple Radar snapshot' : 'Radar provenance mismatch',
    stateSummary,
    trendAgeHours == null ? 'trend-signal age unknown' : `${trendAgeHours.toFixed(1)}h trend-signal age`,
    'Visibility is a bounded chart-position heuristic; it is not downloads, revenue, market share, probability, or a build recommendation.',
  ],
  action: trendState === 'healthy'
    ? null
    : 'Rebuild and validate exact-date trend signals before relying on the Trends workspace or trend-state automation.',
};

health.components = [
  ...(Array.isArray(health.components) ? health.components.filter((item) => item?.id !== 'trend_signals') : []),
  component,
];

const essentialIds = new Set(['apple_radar', 'trend_signals', 'research_queue', 'verification_queue', 'policy_watch']);
const essential = health.components.filter((item) => essentialIds.has(item.id));
health.essentialCount = essential.length;
health.essentialHealthy = essential.filter((item) => item.state === 'healthy').length;

const blocked = essential.some((item) => item.state === 'blocked');
const degraded = essential.some((item) => item.state === 'degraded');
const exactHistoryDays = health.facts?.exactHistoryDays ?? 0;
health.overall = blocked ? 'blocked' : degraded ? 'degraded' : exactHistoryDays < 7 ? 'ready_with_maturing_history' : 'ready';

health.facts = {
  ...(health.facts ?? {}),
  trendSignalCount: signalCount ?? 0,
  trendExpectedSignalCount: expectedSignalCount,
  trendHealthyMarketCount: healthyTrendMarkets ?? 0,
  trendExpectedMarketCount: expectedMarketCount,
  trendDerivedFromCurrentRadar: derivedFromCurrentRadar,
  trendChartDepthMatches: chartDepthMatches,
  trendStateCounts: stateCounts,
};

health.recommendedActions = (Array.isArray(health.recommendedActions) ? health.recommendedActions : [])
  .filter((action) => action?.action !== 'FIX_TREND_SIGNAL_HEALTH');
if (trendState !== 'healthy') {
  health.recommendedActions.push({
    priority: 2,
    action: 'FIX_TREND_SIGNAL_HEALTH',
    why: 'The generated trend artifact is stale, incomplete, or no longer derived from the current Apple Radar snapshot.',
  });
}
health.recommendedActions.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

fs.writeFileSync(healthPath, `${JSON.stringify(health, null, 2)}\n`, 'utf8');
console.log(`[trend-health] ${trendState} · ${signalCount ?? 0}/${expectedSignalCount} signals · ${healthyTrendMarkets ?? 0}/${expectedMarketCount} markets · essential ${health.essentialHealthy}/${health.essentialCount}`);
