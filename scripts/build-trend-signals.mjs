import fs from 'node:fs';
import path from 'node:path';
import { assessTrend, consecutiveSnapshotDays, MIN_TREND_HISTORY_DAYS, subtractUtcDays } from './trend-state.mjs';

const radarRoot = path.resolve('public/data/radar');
const latestPath = path.join(radarRoot, 'latest.json');
const indexPath = path.join(radarRoot, 'index.json');
const outputPath = path.join(radarRoot, 'trend-signals.json');
const LOOKBACK_DAYS = [1, 3, 7];

function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function dateKey(value) { return typeof value === 'string' ? value.slice(0, 10) : null; }
function rankVisibility(rank, depth) {
  if (!Number.isInteger(rank) || !Number.isInteger(depth) || depth < 1 || rank < 1 || rank > depth) return null;
  return Math.max(0, Math.min(1, Math.log((depth + 1) / rank) / Math.log(depth + 1)));
}
function inferredDepth(snapshot, market) {
  if (Number.isInteger(snapshot?.chartDepth)) return snapshot.chartDepth;
  const entries = Array.isArray(market?.entries) ? market.entries : [];
  return Math.max(0, ...entries.map((entry) => Number(entry?.rank) || 0), entries.length);
}
function loadHistory(latest, index) {
  const currentDate = dateKey(latest.generatedAt);
  const dates = [...new Set([currentDate, ...(Array.isArray(index?.snapshots) ? index.snapshots.map((item) => item?.date) : [])].filter(Boolean))];
  const snapshots = new Map();
  for (const date of dates) {
    if (date === currentDate) snapshots.set(date, latest);
    else { const snapshot = readJson(path.join(radarRoot, 'history', `${date}.json`)); if (snapshot) snapshots.set(date, snapshot); }
  }
  return snapshots;
}
function exactWindow(history, currentDate, marketCode, appId, currentRank, days, currentGameFocused, currentChartDepth) {
  const targetDate = subtractUtcDays(currentDate, days);
  const prior = history.get(targetDate);
  if (!prior) return { days, targetDate, status: 'history_missing', priorRank: null, currentRank: null, delta: null };
  const market = prior.markets?.[marketCode];
  if (!market || market.status !== 'ok') return { days, targetDate, status: 'market_failed', priorRank: null, currentRank: null, delta: null };
  if (typeof market.gameFocused === 'boolean' && market.gameFocused !== currentGameFocused) return { days, targetDate, status: 'source_mismatch', priorRank: null, currentRank: null, delta: null };
  const priorEntry = Array.isArray(market.entries) ? market.entries.find((item) => String(item.appId) === String(appId)) : null;
  if (priorEntry) return { days, targetDate, status: 'available', priorRank: priorEntry.rank, currentRank, delta: priorEntry.rank - currentRank };
  const priorDepth = inferredDepth(prior, market);
  if (priorDepth > 0 && priorDepth < currentChartDepth && currentRank > priorDepth) return { days, targetDate, status: 'coverage_gap', priorRank: null, currentRank: null, delta: null };
  return { days, targetDate, status: 'not_ranked', priorRank: null, currentRank: null, delta: null };
}

const latest = readJson(latestPath);
if (!latest?.generatedAt || !latest?.markets) throw new Error('A valid Radar latest.json is required before trend signals can be built.');
const index = readJson(indexPath, { snapshots: [] });
const currentDate = dateKey(latest.generatedAt);
const consecutiveHistoryDays = consecutiveSnapshotDays(index, currentDate);
const chartDepth = latest.chartDepth ?? Math.max(50, ...Object.values(latest.markets).map((market) => Array.isArray(market?.entries) ? market.entries.length : 0));
const history = loadHistory(latest, index);
const markets = {}; const stateCounts = {}; let signalCount = 0;
for (const [marketCode, market] of Object.entries(latest.markets)) {
  if (market?.status !== 'ok' || market?.gameFocused === false || !Array.isArray(market.entries)) {
    markets[marketCode] = { country: marketCode, label: market?.label ?? marketCode, status: market?.status ?? 'failed', sourceMode: market?.sourceMode ?? null, gameFocused: market?.gameFocused ?? false, signals: [] };
    continue;
  }
  const signals = market.entries.map((entry) => {
    const windows = Object.fromEntries(LOOKBACK_DAYS.map((days) => [`${days}d`, exactWindow(history, currentDate, marketCode, entry.appId, entry.rank, days, true, chartDepth)]));
    const trend = assessTrend(entry, windows, consecutiveHistoryDays); stateCounts[trend.state] = (stateCounts[trend.state] ?? 0) + 1; signalCount += 1;
    return {
      appId: String(entry.appId),
      name: entry.name,
      publisher: entry.publisher,
      iconUrl: entry.iconUrl ?? null,
      storeUrl: entry.storeUrl ?? null,
      rank: entry.rank,
      chartDepth,
      visibility: rankVisibility(entry.rank, chartDepth),
      daysObserved: entry.daysObserved ?? 1,
      bestObservedRank: entry.bestObservedRank ?? entry.rank,
      exactWindows: windows,
      trend,
    };
  });
  markets[marketCode] = { country: marketCode, label: market.label, status: 'ok', sourceMode: market.sourceMode ?? null, gameFocused: true, signals };
}
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  radarGeneratedAt: latest.generatedAt,
  radarDate: currentDate,
  chart: latest.chart,
  category: latest.category,
  chartDepth,
  statement: 'Trend signals describe observed Apple Games chart position, exact dated rank movement, and persistence. Exact movement facts remain visible while history matures, but no directional or emerging state is assigned before seven consecutive exact daily snapshots. Visibility is a bounded rank-position heuristic only; it is not download share, revenue share, market share, probability, or a build recommendation.',
  method: {
    name: 'exact_rank_trend_signals_v1',
    lookbackDays: LOOKBACK_DAYS,
    minimumConsecutiveHistoryDays: MIN_TREND_HISTORY_DAYS,
    visibilityFormula: 'ln((N+1)/rank)/ln(N+1)',
    statesEmitted: ['EMERGING', 'RISING', 'ESTABLISHED', 'DECLINING', 'INSUFFICIENT_DATA'],
    statesReservedForOtherEvidence: ['CROWDED', 'WINDOW_CLOSING'],
    missingHistoryRule: 'Never interpolate or smooth a missing exact comparison date. If an older chart is shallower than the current chart, absence below the old cutoff is coverage_gap, not not_ranked.',
    historyMaturityRule: 'All non-INSUFFICIENT_DATA states require at least 7 consecutive exact dated snapshots ending on radarDate. Exact 1d/3d/7d movement facts may be shown earlier but cannot assign a trend state.',
    directionalStateRule: 'After the 7-day history maturity gate, RISING and DECLINING require an exact comparable 3-day rank window. One-day movement is displayed separately as a movement fact.',
  },
  summary: { marketCount: Object.keys(markets).length, healthyGameMarkets: Object.values(markets).filter((market) => market.status === 'ok' && market.gameFocused === true).length, signalCount, consecutiveHistoryDays, stateCounts },
  markets,
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`[trend-signals] ${signalCount} signals across ${output.summary.healthyGameMarkets} healthy Games market(s) · history ${consecutiveHistoryDays}/${MIN_TREND_HISTORY_DAYS} · ${JSON.stringify(stateCounts)}`);
