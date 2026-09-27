import fs from 'node:fs';
import path from 'node:path';

const radarRoot = path.resolve('public/data/radar');
const latestPath = path.join(radarRoot, 'latest.json');
const indexPath = path.join(radarRoot, 'index.json');
const outputPath = path.join(radarRoot, 'trend-signals.json');
const LOOKBACK_DAYS = [1, 3, 7];

function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function dateKey(value) { return typeof value === 'string' ? value.slice(0, 10) : null; }
function subtractUtcDays(date, days) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() - days); return value.toISOString().slice(0, 10); }
function rankVisibility(rank, depth) {
  if (!Number.isInteger(rank) || !Number.isInteger(depth) || depth < 1 || rank < 1 || rank > depth) return null;
  return Math.max(0, Math.min(1, Math.log((depth + 1) / rank) / Math.log(depth + 1)));
}
function inferredDepth(snapshot, market) {
  if (Number.isInteger(snapshot?.chartDepth)) return snapshot.chartDepth;
  const entries = Array.isArray(market?.entries) ? market.entries : [];
  return Math.max(0, ...entries.map((entry) => Number(entry?.rank) || 0), entries.length);
}
function loadHistory(latest) {
  const index = readJson(indexPath, { snapshots: [] });
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
function assessTrend(entry, windows) {
  const oneDay = windows['1d']; const threeDay = windows['3d']; const sevenDay = windows['7d'];
  if (oneDay.status === 'not_ranked' && entry.rank <= 20) return { state: 'EMERGING', reason: `Entered the tracked Games range at #${entry.rank} after a comparable exact prior-day chart did not contain the title.`, evidenceDays: [1] };
  if (sevenDay.status === 'available' && (sevenDay.delta ?? 0) <= -10) return { state: 'DECLINING', reason: `Rank fell ${Math.abs(sevenDay.delta)} places over the exact 7-day window.`, evidenceDays: [7] };
  if (threeDay.status === 'available' && (threeDay.delta ?? 0) <= -5) return { state: 'DECLINING', reason: `Rank fell ${Math.abs(threeDay.delta)} places over the exact 3-day window.`, evidenceDays: [3] };
  if (sevenDay.status === 'available' && (sevenDay.delta ?? 0) >= 10) return { state: 'RISING', reason: `Rank improved ${sevenDay.delta} places over the exact 7-day window.`, evidenceDays: [7] };
  if (threeDay.status === 'available' && (threeDay.delta ?? 0) >= 5) return { state: 'RISING', reason: `Rank improved ${threeDay.delta} places over the exact 3-day window.`, evidenceDays: [3] };
  if (oneDay.status === 'available' && (oneDay.delta ?? 0) >= 8) return { state: 'RISING', reason: `Rank improved ${oneDay.delta} places on the exact prior-day comparison.`, evidenceDays: [1] };
  if ((entry.daysObserved ?? 0) >= 7 && sevenDay.status === 'available' && entry.rank <= 30) return { state: 'ESTABLISHED', reason: `Observed for ${entry.daysObserved} consecutive daily snapshots, currently #${entry.rank}, with an exact 7-day comparison available.`, evidenceDays: [7] };
  const gap = [oneDay, threeDay, sevenDay].some((signal) => signal.status === 'coverage_gap');
  const mismatch = [oneDay, threeDay, sevenDay].some((signal) => signal.status === 'source_mismatch');
  return {
    state: 'INSUFFICIENT_DATA',
    reason: gap
      ? 'At least one exact comparison falls outside a shallower historical chart depth, so absence remains unknown.'
      : mismatch
        ? 'At least one exact comparison uses an incompatible chart source, so no directional trend is inferred from that window.'
        : 'Exact rank history does not yet meet the evidence gate for emerging, rising, established, or declining.',
    evidenceDays: [],
  };
}

const latest = readJson(latestPath);
if (!latest?.generatedAt || !latest?.markets) throw new Error('A valid Radar latest.json is required before trend signals can be built.');
const currentDate = dateKey(latest.generatedAt);
const chartDepth = latest.chartDepth ?? Math.max(50, ...Object.values(latest.markets).map((market) => Array.isArray(market?.entries) ? market.entries.length : 0));
const history = loadHistory(latest);
const markets = {}; const stateCounts = {}; let signalCount = 0;

for (const [marketCode, market] of Object.entries(latest.markets)) {
  if (market?.status !== 'ok' || market?.gameFocused === false || !Array.isArray(market.entries)) {
    markets[marketCode] = { country: marketCode, label: market?.label ?? marketCode, status: market?.status ?? 'failed', sourceMode: market?.sourceMode ?? null, gameFocused: market?.gameFocused ?? false, signals: [] };
    continue;
  }
  const signals = market.entries.map((entry) => {
    const windows = Object.fromEntries(LOOKBACK_DAYS.map((days) => [`${days}d`, exactWindow(history, currentDate, marketCode, entry.appId, entry.rank, days, true, chartDepth)]));
    const trend = assessTrend(entry, windows);
    stateCounts[trend.state] = (stateCounts[trend.state] ?? 0) + 1; signalCount += 1;
    return { appId: String(entry.appId), name: entry.name, publisher: entry.publisher, rank: entry.rank, chartDepth, visibility: rankVisibility(entry.rank, chartDepth), daysObserved: entry.daysObserved ?? 1, bestObservedRank: entry.bestObservedRank ?? entry.rank, exactWindows: windows, trend };
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
  statement: 'Trend signals describe observed Apple Games chart position, exact dated rank movement, and persistence. Visibility is a bounded rank-position heuristic only; it is not download share, revenue share, market share, probability, or a build recommendation.',
  method: {
    name: 'exact_rank_trend_signals_v1', lookbackDays: LOOKBACK_DAYS, visibilityFormula: 'ln((N+1)/rank)/ln(N+1)',
    statesEmitted: ['EMERGING', 'RISING', 'ESTABLISHED', 'DECLINING', 'INSUFFICIENT_DATA'], statesReservedForOtherEvidence: ['CROWDED', 'WINDOW_CLOSING'],
    missingHistoryRule: 'Never interpolate or smooth a missing exact comparison date. If an older chart is shallower than the current chart, absence below the old cutoff is coverage_gap, not not_ranked.',
  },
  summary: { marketCount: Object.keys(markets).length, healthyGameMarkets: Object.values(markets).filter((market) => market.status === 'ok' && market.gameFocused === true).length, signalCount, stateCounts },
  markets,
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`[trend-signals] ${signalCount} signals across ${output.summary.healthyGameMarkets} healthy Games market(s) · ${JSON.stringify(stateCounts)}`);
