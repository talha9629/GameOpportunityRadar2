import fs from 'node:fs';
import path from 'node:path';

// Daily public-chart collector. Each market persists independently so one failure never discards the others.
// The scheduled run is the source of truth for rank observations; same-day reruns are idempotent.
const markets = { us: 'United States', gb: 'United Kingdom', ca: 'Canada', au: 'Australia' };
const chartDepth = 100;
const root = path.resolve('public/data/radar');
const latestPath = path.join(root, 'latest.json');
const indexPath = path.join(root, 'index.json');
const now = new Date();
const generatedAt = now.toISOString();
const today = generatedAt.slice(0, 10);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function readPrevious() {
  return readJson(latestPath, { markets: {} });
}

function readIndex() {
  return readJson(indexPath, { schemaVersion: 1, updatedAt: generatedAt, snapshots: [] });
}

function legacyEntry(entry, index) {
  const images = Array.isArray(entry?.['im:image']) ? entry['im:image'] : [];
  return {
    rank: index + 1,
    appId: String(entry?.id?.attributes?.['im:id'] ?? ''),
    name: entry?.['im:name']?.label ?? 'Unknown',
    publisher: entry?.['im:artist']?.label ?? 'Unknown',
    iconUrl: images.at(-1)?.label ?? null,
    storeUrl: entry?.id?.label ?? null,
  };
}

async function fetchMarket(country) {
  const legacyUrl = `https://itunes.apple.com/${country}/rss/topfreeapplications/limit=${chartDepth}/genre=6014/json`;
  try {
    const response = await fetch(legacyUrl, { headers: { 'User-Agent': 'GameOpportunityRadar2/0.8' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const entries = Array.isArray(json?.feed?.entry) ? json.feed.entry : [];
    if (entries.length >= 10) {
      return { sourceMode: 'apple_itunes_rss_games', sourceUrl: legacyUrl, gameFocused: true, entries: entries.map(legacyEntry) };
    }
    throw new Error(`Only ${entries.length} entries returned`);
  } catch (legacyError) {
    const fallbackUrl = `https://rss.marketingtools.apple.com/api/v2/${country}/apps/top-free/${chartDepth}/apps.json`;
    const response = await fetch(fallbackUrl, { headers: { 'User-Agent': 'GameOpportunityRadar2/0.8' } });
    if (!response.ok) throw new Error(`${country}: legacy failed (${legacyError}); fallback HTTP ${response.status}`);
    const json = await response.json();
    const results = Array.isArray(json?.feed?.results) ? json.feed.results : [];
    if (results.length === 0) throw new Error(`${country}: Apple fallback returned no entries`);
    return {
      sourceMode: 'apple_marketing_tools_top_free_overall', sourceUrl: fallbackUrl, gameFocused: false,
      warning: `Games-category RSS unavailable: ${String(legacyError)}`,
      entries: results.map((item, index) => ({
        rank: index + 1,
        appId: String(item.id),
        name: item.name,
        publisher: item.artistName,
        iconUrl: item.artworkUrl100 ?? null,
        storeUrl: item.url ?? null,
      })),
    };
  }
}

function addHistory(entry, previousMarket, sameDay) {
  const prior = previousMarket?.entries?.find((item) => item.appId === entry.appId);
  if (!prior) {
    return { ...entry, priorRank: null, delta: null, firstObserved: today, daysObserved: 1, bestObservedRank: entry.rank, events: ['NEW ENTRY'] };
  }

  const firstDayReplacement = sameDay && prior.firstObserved === today && (prior.daysObserved ?? 1) === 1;
  const bestBefore = prior.bestObservedRank ?? prior.rank;
  const bestObservedRank = firstDayReplacement ? entry.rank : Math.min(bestBefore, entry.rank);
  const comparisonRank = sameDay ? prior.priorRank : prior.rank;
  const events = [];
  if (sameDay && prior.firstObserved === today && prior.events?.includes('NEW ENTRY')) events.push('NEW ENTRY');
  if (!firstDayReplacement && entry.rank < bestBefore) events.push('NEW HIGH');
  if (comparisonRank != null && comparisonRank > 10 && entry.rank <= 10) events.push('TOP 10');

  return {
    ...entry,
    priorRank: comparisonRank ?? null,
    delta: comparisonRank != null ? comparisonRank - entry.rank : null,
    firstObserved: prior.firstObserved ?? today,
    daysObserved: sameDay ? (prior.daysObserved ?? 1) : (prior.daysObserved ?? 1) + 1,
    bestObservedRank,
    events,
  };
}

const previous = readPrevious();
const previousDate = typeof previous.generatedAt === 'string' ? previous.generatedAt.slice(0, 10) : null;
const sameDay = previousDate === today;
const output = {
  schemaVersion: 3,
  generatedAt,
  chart: 'top-free',
  category: 'Games',
  chartDepth,
  runStatus: 'failed',
  successfulMarkets: 0,
  freshMarkets: 0,
  markets: {},
};

for (const [country, label] of Object.entries(markets)) {
  try {
    const snapshot = await fetchMarket(country);
    output.markets[country] = {
      country,
      label,
      status: 'ok',
      sourceMode: snapshot.sourceMode,
      sourceUrl: snapshot.sourceUrl,
      gameFocused: snapshot.gameFocused,
      warning: snapshot.warning ?? null,
      observedAt: generatedAt,
      refreshStatus: 'fresh',
      entries: snapshot.entries.map((entry) => addHistory(entry, previous.markets?.[country], sameDay)),
    };
  } catch (error) {
    const priorMarket = previous.markets?.[country];
    if (sameDay && priorMarket?.status === 'ok' && Array.isArray(priorMarket.entries) && priorMarket.entries.length > 0) {
      const priorWarning = priorMarket.warning ? `${priorMarket.warning} ` : '';
      output.markets[country] = {
        ...priorMarket,
        country,
        label,
        warning: `${priorWarning}Latest same-day refresh failed; preserving the earlier successful ${today} observation. ${String(error)}`,
        observedAt: priorMarket.observedAt ?? previous.generatedAt ?? generatedAt,
        refreshStatus: 'preserved_same_day',
      };
    } else {
      output.markets[country] = {
        country,
        label,
        status: 'failed',
        error: String(error),
        observedAt: generatedAt,
        refreshStatus: 'fresh',
        entries: [],
      };
    }
  }
}

const marketValues = Object.values(output.markets);
output.successfulMarkets = marketValues.filter((market) => market.status === 'ok').length;
output.freshMarkets = marketValues.filter((market) => market.status === 'ok' && market.refreshStatus === 'fresh').length;
output.runStatus = output.freshMarkets === Object.keys(markets).length
  ? 'complete'
  : output.successfulMarkets > 0
    ? 'partial'
    : 'failed';

fs.mkdirSync(path.join(root, 'history'), { recursive: true });
fs.writeFileSync(latestPath, JSON.stringify(output, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'history', `${today}.json`), JSON.stringify(output, null, 2) + '\n');

const previousIndex = readIndex();
const indexEntry = {
  date: today,
  generatedAt,
  chartDepth,
  successfulMarkets: output.successfulMarkets,
  freshMarkets: output.freshMarkets,
  gameFocusedMarkets: marketValues.filter((market) => market.status === 'ok' && market.gameFocused === true).length,
  runStatus: output.runStatus,
  marketStatus: Object.fromEntries(Object.entries(output.markets).map(([country, market]) => [country, market.status])),
};
const snapshots = [
  indexEntry,
  ...(Array.isArray(previousIndex.snapshots) ? previousIndex.snapshots.filter((item) => item?.date !== today) : []),
]
  .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  .slice(0, 60);
const index = { schemaVersion: 1, updatedAt: generatedAt, snapshots };
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');

console.log(`Radar snapshot written for ${today} (depth=${chartDepth}, sameDay=${sameDay}, runStatus=${output.runStatus})`);
for (const market of Object.values(output.markets)) {
  console.log(`${market.country}: ${market.status} ${market.entries.length} entries ${market.sourceMode ?? ''} ${market.refreshStatus ?? ''}`);
}
