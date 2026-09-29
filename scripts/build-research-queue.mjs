import fs from 'node:fs';
import path from 'node:path';
import { applyResearchTrendMaturity } from './research-trend.mjs';
import { consecutiveSnapshotDays, MIN_TREND_HISTORY_DAYS } from './trend-state.mjs';

const radarRoot = path.resolve('public/data/radar');
const queueRoot = path.resolve('public/data/research');
const latestRadarPath = path.join(radarRoot, 'latest.json');
const radarIndexPath = path.join(radarRoot, 'index.json');
const outputPath = path.join(queueRoot, 'latest.json');
const historyRoot = path.join(queueRoot, 'history');

const APPBRAIN_DAILY_CAP = Math.max(0, Math.min(10, Number.parseInt(process.env.APPBRAIN_DAILY_CREDIT_CAP ?? '10', 10) || 10));
const APPBRAIN_KEY = process.env.APPBRAIN_API_KEY?.trim() || '';
const MAX_CANDIDATES = 12;
const LOOKBACK_DAYS = [1, 3, 7];

function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function dateKey(value) { return typeof value === 'string' ? value.slice(0, 10) : null; }
function subtractUtcDays(date, days) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() - days); return value.toISOString().slice(0, 10); }
function daysBetween(older, newer) {
  if (!older || !newer) return null;
  const start = new Date(older); const end = new Date(newer);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return null;
  return Math.max(0, Math.floor((end.valueOf() - start.valueOf()) / 86_400_000));
}
function round4(value) { return Number(value.toFixed(4)); }
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function visibilityForRank(rank, chartDepth) {
  if (!Number.isFinite(rank) || !Number.isFinite(chartDepth) || rank < 1 || chartDepth < rank) return null;
  return round4(Math.max(0, Math.min(1, Math.log((chartDepth + 1) / rank) / Math.log(chartDepth + 1))));
}
function loadRadarHistory(latest) {
  const index = readJson(radarIndexPath, { snapshots: [] });
  const latestDate = dateKey(latest.generatedAt);
  const dates = [...new Set([latestDate, ...(Array.isArray(index?.snapshots) ? index.snapshots.map((item) => item?.date) : [])].filter(Boolean))].slice(0, 15);
  const snapshots = new Map();
  for (const date of dates) {
    if (date === latestDate) { snapshots.set(date, latest); continue; }
    const snapshot = readJson(path.join(radarRoot, 'history', `${date}.json`)); if (snapshot) snapshots.set(date, snapshot);
  }
  return snapshots;
}
function inferredChartDepth(snapshot, market) {
  if (Number.isInteger(snapshot?.chartDepth)) return snapshot.chartDepth;
  const entries = Array.isArray(market?.entries) ? market.entries : [];
  return Math.max(0, ...entries.map((entry) => Number(entry?.rank) || 0), entries.length);
}
function exactWindow(history, currentDate, marketCode, appId, days, currentGameFocused, currentRank, currentChartDepth) {
  const targetDate = subtractUtcDays(currentDate, days);
  const prior = history.get(targetDate);
  if (!prior) return { days, targetDate, status: 'history_missing', priorRank: null, currentRank: null, delta: null };
  const market = prior.markets?.[marketCode];
  if (!market || market.status !== 'ok') return { days, targetDate, status: 'market_failed', priorRank: null, currentRank: null, delta: null };
  if (typeof market.gameFocused === 'boolean' && market.gameFocused !== currentGameFocused) return { days, targetDate, status: 'source_mismatch', priorRank: null, currentRank: null, delta: null };
  const entry = Array.isArray(market.entries) ? market.entries.find((item) => String(item.appId) === String(appId)) : null;
  if (entry) return { days, targetDate, status: 'available', priorRank: entry.rank, currentRank, delta: entry.rank - currentRank };
  const priorDepth = inferredChartDepth(prior, market);
  if (priorDepth > 0 && priorDepth < currentChartDepth && currentRank > priorDepth) return { days, targetDate, status: 'coverage_gap', priorRank: null, currentRank: null, delta: null };
  return { days, targetDate, status: 'not_ranked', priorRank: null, currentRank: null, delta: null };
}
function summarizeWindowStatus(perMarket) {
  if (perMarket.some((signal) => signal.status === 'available')) return 'available';
  if (perMarket.some((signal) => signal.status === 'coverage_gap')) return 'coverage_gap';
  if (perMarket.some((signal) => signal.status === 'source_mismatch')) return 'source_mismatch';
  if (perMarket.some((signal) => signal.status === 'not_ranked')) return 'not_ranked';
  if (perMarket.some((signal) => signal.status === 'market_failed')) return 'market_failed';
  return 'history_missing';
}
function classifyTrend(exactWindows) {
  const three = exactWindows['3d'].perMarket; const seven = exactWindows['7d'].perMarket;
  const threeDeltas = three.filter((signal) => signal.status === 'available').map((signal) => signal.delta);
  const sevenDeltas = seven.filter((signal) => signal.status === 'available').map((signal) => signal.delta);
  const entered3d = three.filter((signal) => signal.status === 'not_ranked').length;
  const coverageGaps3d = three.filter((signal) => signal.status === 'coverage_gap').length;
  const median3dDelta = median(threeDeltas); const median7dDelta = median(sevenDeltas);
  const rationale = []; let state = 'INSUFFICIENT_DATA';
  if (entered3d > 0 && threeDeltas.length === 0 && coverageGaps3d === 0) {
    state = 'EMERGING'; rationale.push(`${entered3d} current market(s) were outside the tracked range exactly 3 days ago.`);
  } else if (median3dDelta != null && median3dDelta >= 5) {
    state = 'RISING'; rationale.push(`Median exact 3-day rank move is +${median3dDelta} across ${threeDeltas.length} comparable market(s).`);
  } else if (median3dDelta != null && median3dDelta <= -5) {
    state = 'DECLINING'; rationale.push(`Median exact 3-day rank move is ${median3dDelta} across ${threeDeltas.length} comparable market(s).`);
  } else if (median7dDelta != null && median3dDelta != null && Math.abs(median3dDelta) < 5 && Math.abs(median7dDelta) < 8) {
    state = 'ESTABLISHED'; rationale.push(`Exact 3-day and 7-day comparisons exist without a strong directional move (${median3dDelta} / ${median7dDelta} median ranks).`);
  } else {
    if (exactWindows['3d'].status === 'history_missing') rationale.push('Exact 3-day history is not available yet.');
    if (exactWindows['3d'].status === 'coverage_gap') rationale.push('The historical chart was shallower than the current chart for at least one market.');
    if (exactWindows['3d'].status === 'source_mismatch') rationale.push('At least one exact 3-day market used an incompatible chart source.');
    if (median3dDelta != null && exactWindows['7d'].status !== 'available') rationale.push('3-day movement is available, but a mature 7-day comparison is still missing.');
    if (rationale.length === 0) rationale.push('Exact rank history does not yet meet a directional or persistence evidence gate.');
  }
  return { state, basis: 'exact_rank_history_v1', comparable3dMarkets: threeDeltas.length, comparable7dMarkets: sevenDeltas.length, newlyEntered3dMarkets: entered3d, coverageGap3dMarkets: coverageGaps3d, median3dDelta, median7dDelta, rationale };
}

function buildAggregates(latest, history) {
  const currentDate = dateKey(latest.generatedAt);
  if (!currentDate) throw new Error('Latest Radar snapshot has no usable generatedAt date.');
  const currentChartDepth = Number.isInteger(latest.chartDepth) ? latest.chartDepth : 50;
  const radarIndex = readJson(radarIndexPath, { snapshots: [] });
  const consecutiveHistoryDays = consecutiveSnapshotDays(radarIndex, currentDate);
  const aggregate = new Map();
  for (const [marketCode, market] of Object.entries(latest.markets ?? {})) {
    if (market?.status !== 'ok' || market?.gameFocused === false || !Array.isArray(market.entries)) continue;
    for (const entry of market.entries) {
      const appId = String(entry.appId);
      const item = aggregate.get(appId) ?? { appId, name: entry.name, publisher: entry.publisher, iconUrl: entry.iconUrl ?? null, storeUrl: entry.storeUrl ?? null, markets: [] };
      item.markets.push({ country: marketCode, market: market.label, rank: entry.rank, priorRank: entry.priorRank ?? null, delta: entry.delta ?? null, daysObserved: entry.daysObserved ?? 1, bestObservedRank: entry.bestObservedRank ?? entry.rank, newEntry: Array.isArray(entry.events) && entry.events.includes('NEW ENTRY'), sourceMode: market.sourceMode ?? null, observedAt: market.observedAt ?? latest.generatedAt, visibility: visibilityForRank(entry.rank, currentChartDepth) });
      aggregate.set(appId, item);
    }
  }
  return [...aggregate.values()].map((item) => {
    item.markets.sort((a, b) => a.rank - b.rank);
    const best = item.markets[0]; const marketCount = item.markets.length; const bestRank = best.rank;
    const averageRank = item.markets.reduce((sum, market) => sum + market.rank, 0) / marketCount;
    const maxObservedDays = Math.max(...item.markets.map((market) => market.daysObserved));
    const newEntry = item.markets.some((market) => market.newEntry);
    const visibilityScores = item.markets.map((market) => market.visibility).filter((value) => value != null);
    const exactWindows = Object.fromEntries(LOOKBACK_DAYS.map((days) => {
      const perMarket = item.markets.map((market) => exactWindow(history, currentDate, market.country, item.appId, days, true, market.rank, currentChartDepth));
      const available = perMarket.filter((signal) => signal.status === 'available'); const status = summarizeWindowStatus(perMarket);
      return [`${days}d`, { days, status, bestUpwardDelta: status === 'available' ? Math.max(...available.map((signal) => signal.delta)) : null, perMarket }];
    }));
    const trend = applyResearchTrendMaturity(classifyTrend(exactWindows), consecutiveHistoryDays);
    const oneDayUp = exactWindows['1d'].status === 'available' ? exactWindows['1d'].bestUpwardDelta : null;
    const reasons = []; let priority = 0;
    if (marketCount >= 4) { priority += 35; reasons.push('CROSS_MARKET_4'); } else if (marketCount === 3) { priority += 30; reasons.push('CROSS_MARKET_3'); } else if (marketCount === 2) { priority += 22; reasons.push('CROSS_MARKET_2'); }
    if (bestRank <= 3) { priority += 20; reasons.push('TOP_3'); } else if (bestRank <= 10) { priority += 14; reasons.push('TOP_10'); } else if (bestRank <= 20) { priority += 8; reasons.push('TOP_20'); }
    if (oneDayUp != null && oneDayUp >= 15) { priority += 15; reasons.push('UP_15_PLUS_1D'); } else if (oneDayUp != null && oneDayUp >= 8) { priority += 10; reasons.push('UP_8_PLUS_1D'); } else if (oneDayUp != null && oneDayUp >= 3) { priority += 5; reasons.push('UP_3_PLUS_1D'); }
    if (newEntry && bestRank <= 10) { priority += 12; reasons.push('NEW_ENTRY_TOP_10'); } else if (newEntry && bestRank <= 20) { priority += 8; reasons.push('NEW_ENTRY_TOP_20'); }
    if (maxObservedDays >= 7) { priority += 12; reasons.push('PERSISTED_7D'); } else if (maxObservedDays >= 3) { priority += 6; reasons.push('PERSISTED_3D'); }
    const eligible = marketCount >= 2 || bestRank <= 10 || (oneDayUp ?? 0) >= 5 || (newEntry && bestRank <= 20);
    return { ...item, marketCount, bestRank, averageRank: Number(averageRank.toFixed(2)), maxObservedDays, newEntry, primaryCountry: best.country, chartDepth: currentChartDepth, visibility: { method: 'bounded_log_rank_visibility_v1', chartDepth: currentChartDepth, best: visibilityScores.length ? Math.max(...visibilityScores) : 0, average: visibilityScores.length ? round4(visibilityScores.reduce((sum, value) => sum + value, 0) / visibilityScores.length) : 0 }, exactWindows, trend, researchPriority: Math.min(100, priority), reasonCodes: reasons, eligible };
  });
}

async function fetchAppleMetadata(candidates, observedAt) {
  const byCountry = new Map();
  for (const candidate of candidates) { const country = candidate.primaryCountry || 'us'; const ids = byCountry.get(country) ?? []; ids.push(candidate.appId); byCountry.set(country, ids); }
  const metadata = new Map(); const failures = [];
  for (const [country, ids] of byCountry.entries()) {
    const endpoint = `https://itunes.apple.com/lookup?id=${ids.map(encodeURIComponent).join(',')}&country=${encodeURIComponent(country)}&entity=software`;
    try {
      const response = await fetch(endpoint, { headers: { 'User-Agent': 'GameOpportunityRadar2/0.9' } }); if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json(); const results = Array.isArray(payload?.results) ? payload.results : [];
      for (const item of results) {
        if (!item?.trackId) continue;
        metadata.set(String(item.trackId), { sourceOrigin: 'official_public', interpretation: 'direct', observedAt, country, sourceUrl: endpoint, canonicalName: item.trackName ?? null, publisher: item.sellerName ?? item.artistName ?? null, primaryGenreName: item.primaryGenreName ?? null, genres: Array.isArray(item.genres) ? item.genres : [], rating: typeof item.averageUserRating === 'number' ? item.averageUserRating : null, ratingCount: Number.isInteger(item.userRatingCount) ? item.userRatingCount : null, releaseDate: item.releaseDate ?? null, currentVersionReleaseDate: item.currentVersionReleaseDate ?? null, version: item.version ?? null, contentAdvisoryRating: item.contentAdvisoryRating ?? null, minimumOsVersion: item.minimumOsVersion ?? null, releaseAgeDays: daysBetween(item.releaseDate, observedAt), versionAgeDays: daysBetween(item.currentVersionReleaseDate, observedAt) });
      }
      for (const id of ids) if (!metadata.has(String(id))) failures.push({ appId: String(id), country, error: 'Apple lookup returned no matching result.' });
    } catch (error) { for (const id of ids) failures.push({ appId: String(id), country, error: String(error) }); }
  }
  return { metadata, failures };
}
async function fetchAppBrain(candidate) {
  const url = new URL('https://api.appbrain.com/v2/info/getapp'); url.searchParams.set('apikey', APPBRAIN_KEY); url.searchParams.set('package', `ios-${candidate.appId}`); url.searchParams.set('format', 'json');
  const response = await fetch(url, { headers: { 'User-Agent': 'GameOpportunityRadar2/0.9' } }); if (!response.ok) throw new Error(`AppBrain HTTP ${response.status}`);
  const item = await response.json();
  return { sourceOrigin: 'third_party_estimate', interpretation: 'direct_provider_value', provider: 'AppBrain', observedAt: new Date().toISOString(), package: item.package ?? `ios-${candidate.appId}`, estimatedDownloads: Number.isFinite(item.estimatedDownloads) ? item.estimatedDownloads : null, estimatedRecentDownloads: Number.isFinite(item.estimatedRecentDownloads) ? item.estimatedRecentDownloads : null, downloadsCategory: item.downloadsCategory ?? null, rating: typeof item.rating === 'number' ? item.rating : null, ratingCount: Number.isInteger(item.ratingCount) ? item.ratingCount : null, infoRefreshTime: item.infoRefreshTime ?? null };
}

const latest = readJson(latestRadarPath);
if (!latest?.generatedAt || !latest?.markets) throw new Error('A valid Radar latest.json is required before the research queue can be built.');
const radarDate = dateKey(latest.generatedAt); const history = loadRadarHistory(latest);
const aggregates = buildAggregates(latest, history).filter((item) => item.eligible).sort((a, b) => b.researchPriority - a.researchPriority || a.bestRank - b.bestRank || b.marketCount - a.marketCount).slice(0, MAX_CANDIDATES);
const apple = await fetchAppleMetadata(aggregates, latest.generatedAt);
const appBrainResults = new Map(); const appBrainFailures = []; let appBrainCreditsUsed = 0;
if (APPBRAIN_KEY && APPBRAIN_DAILY_CAP > 0) {
  for (const candidate of aggregates.slice(0, APPBRAIN_DAILY_CAP)) {
    try { appBrainResults.set(candidate.appId, await fetchAppBrain(candidate)); appBrainCreditsUsed += 1; } catch (error) { appBrainCreditsUsed += 1; appBrainFailures.push({ appId: candidate.appId, error: String(error) }); }
  }
}

const candidates = aggregates.map((candidate, index) => ({
  queueRank: index + 1, appId: candidate.appId, name: candidate.name, publisher: candidate.publisher, iconUrl: candidate.iconUrl, storeUrl: candidate.storeUrl,
  researchPriority: candidate.researchPriority, priorityMeaning: 'Deterministic research ordering from first-party Apple chart evidence; not a success probability or build recommendation.', reasonCodes: candidate.reasonCodes,
  evidence: { sourceOrigin: 'official_public', chartCategory: 'Games', chartDepth: candidate.chartDepth, marketCount: candidate.marketCount, bestRank: candidate.bestRank, averageRank: candidate.averageRank, maxObservedDays: candidate.maxObservedDays, newEntry: candidate.newEntry, visibility: candidate.visibility, trend: candidate.trend, markets: candidate.markets, exactWindows: candidate.exactWindows },
  appleMetadata: apple.metadata.get(candidate.appId) ?? null, appBrainEstimate: appBrainResults.get(candidate.appId) ?? null,
  nextVerification: [candidate.trend.state === 'INSUFFICIENT_DATA' ? 'Keep exact daily collection running before treating trend direction as mature evidence.' : null, candidate.exactWindows['7d'].status === 'available' ? null : 'Wait for an exact comparable 7-day Games-chart window before making a mature momentum claim.', 'Open Analyze Game to inspect official listing evidence and unknowns.', 'Use Deep Verify for gameplay mechanics, monetization placement, meta and production-complexity evidence.', APPBRAIN_KEY ? null : 'Optional: configure APPBRAIN_API_KEY for capped third-party download-estimate enrichment.'].filter(Boolean),
}));

const output = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), radarDate, radarGeneratedAt: latest.generatedAt,
  method: { name: 'deterministic_research_priority_v1', inputs: ['Apple Games chart rank', 'cross-market presence', 'exact comparable observed rank movement', 'new-entry status', 'consecutive observed persistence'], exclusions: ['downloads', 'revenue', 'rating', 'publisher size', 'AI opinion', 'incompatible chart-source comparisons'], minimumConsecutiveTrendHistoryDays: MIN_TREND_HISTORY_DAYS, earlyMovementRule: 'Exact 1-day movement and observed persistence may order research work before trend maturity, but they cannot activate EMERGING, RISING, ESTABLISHED or DECLINING before 7 consecutive exact daily snapshots.', statement: 'Priority orders what to investigate first. Rank visibility and trend state are descriptive chart transforms, not opportunity scores, predictions, download estimates or causal claims.' },
  sources: {
    appleCharts: { status: Object.values(latest.markets).every((market) => market?.status === 'ok') ? 'complete' : 'partial', origin: 'official_public', observedAt: latest.generatedAt, healthyGameMarkets: Object.values(latest.markets).filter((market) => market?.status === 'ok' && market?.gameFocused !== false).length },
    appleLookup: { status: apple.failures.length === 0 ? 'complete' : apple.metadata.size > 0 ? 'partial' : 'failed', origin: 'official_public', successfulApps: apple.metadata.size, failures: apple.failures },
    appBrain: { status: !APPBRAIN_KEY ? 'unconfigured' : appBrainFailures.length === 0 ? 'complete' : appBrainResults.size > 0 ? 'partial' : 'failed', origin: 'third_party_estimate', dailyCreditCap: APPBRAIN_DAILY_CAP, creditsUsedThisRun: appBrainCreditsUsed, successfulApps: appBrainResults.size, failures: appBrainFailures, note: 'AppBrain getapp costs 1 API credit per app. Values remain labeled estimates and do not affect researchPriority.' },
  },
  limitations: [
    'App Store chart rank and the bounded visibility transform are ordinal chart evidence; neither is a download count, download share, revenue figure or causal measure of demand.',
    'Trend state uses exact dated rank observations only and remains INSUFFICIENT_DATA until 7 consecutive exact daily snapshots exist. CROWDED and WINDOW_CLOSING are intentionally not assigned from rank history alone because they require saturation evidence.',
    'Exact early movement and persistence may prioritize investigation as factual triage signals before 7 days; they do not constitute a mature trend state or momentum conclusion.',
    'A shallower historical chart can create a coverage gap for current ranks below the old cutoff; Radar labels that UNKNOWN instead of treating the title as a new entrant.',
    'The queue currently covers Apple Games charts in US, UK, Canada and Australia; Android is not inferred from iOS.',
    'A missing exact historical date remains UNKNOWN. The queue never interpolates missing rank history.',
    'Games-category and overall Top Free fallback ranks are incompatible chart universes and are never compared for movement.',
    'AppBrain values, when configured, are third-party estimates and are displayed separately from official Apple evidence.',
    'Gameplay mechanics, monetization placement, retention systems and production burden require deeper evidence before a prototype decision.',
  ],
  candidates,
};

fs.mkdirSync(historyRoot, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
fs.writeFileSync(path.join(historyRoot, `${radarDate}.json`), `${JSON.stringify(output, null, 2)}\n`);
console.log(`[research-queue] ${candidates.length} candidates · Apple metadata ${apple.metadata.size}/${candidates.length} · AppBrain ${output.sources.appBrain.status} (${appBrainCreditsUsed} credits)`);
for (const candidate of candidates.slice(0, 5)) console.log(`#${candidate.queueRank} ${candidate.name} · priority ${candidate.researchPriority} · trend ${candidate.evidence.trend.state} · visibility ${candidate.evidence.visibility.average} · ${candidate.reasonCodes.join(', ')}`);
