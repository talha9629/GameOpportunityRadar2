import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('public/data/radar');
const latestPath = path.join(root, 'latest.json');
const indexPath = path.join(root, 'index.json');
const expectedMarkets = ['us', 'gb', 'ca', 'au'];
const maxChartDepth = 100;

function fail(message) {
  throw new Error(`Radar data validation failed: ${message}`);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`${file} is not valid JSON (${error})`); }
}

function dateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : null;
}

function validateEntry(entry, expectedRank, market, file, chartDepth) {
  if (entry?.rank !== expectedRank) fail(`${file} ${market} rank sequence expected ${expectedRank}, got ${entry?.rank}`);
  if (entry.rank > chartDepth) fail(`${file} ${market} rank ${entry.rank} exceeds declared chart depth ${chartDepth}`);
  if (!String(entry?.appId ?? '').trim()) fail(`${file} ${market} rank ${expectedRank} has no appId`);
  if (!String(entry?.name ?? '').trim()) fail(`${file} ${market} rank ${expectedRank} has no name`);
  if (!Number.isInteger(entry?.daysObserved) || entry.daysObserved < 1) fail(`${file} ${market} rank ${expectedRank} has invalid daysObserved`);
  if (!Number.isInteger(entry?.bestObservedRank) || entry.bestObservedRank < 1 || entry.bestObservedRank > maxChartDepth) fail(`${file} ${market} rank ${expectedRank} has invalid bestObservedRank`);
  if (!Array.isArray(entry?.events)) fail(`${file} ${market} rank ${expectedRank} events must be an array`);
}

function validateSnapshot(snapshot, file, expectedDate = null) {
  if (!snapshot || typeof snapshot !== 'object') fail(`${file} is not an object`);
  const snapshotDate = dateKey(snapshot.generatedAt);
  if (!snapshotDate) fail(`${file} has invalid generatedAt`);
  if (expectedDate && snapshotDate !== expectedDate) fail(`${file} generatedAt date ${snapshotDate} does not match filename date ${expectedDate}`);
  if (snapshot.category !== 'Games' || snapshot.chart !== 'top-free') fail(`${file} has unexpected chart/category`);
  if (!snapshot.markets || typeof snapshot.markets !== 'object') fail(`${file} has no markets object`);

  const chartDepth = snapshot.chartDepth ?? Math.max(50, ...Object.values(snapshot.markets).map((market) => Array.isArray(market?.entries) ? market.entries.length : 0));
  if (!Number.isInteger(chartDepth) || chartDepth < 10 || chartDepth > maxChartDepth) fail(`${file} has invalid chartDepth ${chartDepth}`);

  let successful = 0;
  let fresh = 0;
  for (const code of expectedMarkets) {
    const market = snapshot.markets[code];
    if (!market) fail(`${file} is missing ${code}`);
    if (!['ok', 'failed'].includes(market.status)) fail(`${file} ${code} has invalid status`);
    if (!Array.isArray(market.entries)) fail(`${file} ${code} entries must be an array`);

    if (market.status === 'ok') {
      successful += 1;
      if (market.entries.length < 10 || market.entries.length > chartDepth) fail(`${file} ${code} successful market has ${market.entries.length} entries for chartDepth ${chartDepth}`);
      const ids = new Set();
      market.entries.forEach((entry, index) => {
        validateEntry(entry, index + 1, code, file, chartDepth);
        if (ids.has(entry.appId)) fail(`${file} ${code} contains duplicate appId ${entry.appId}`);
        ids.add(entry.appId);
      });
      if (market.refreshStatus == null || market.refreshStatus === 'fresh') fresh += 1;
      if (market.gameFocused !== true && market.gameFocused !== false) fail(`${file} ${code} successful market must declare gameFocused`);
    } else if (market.entries.length !== 0) {
      fail(`${file} ${code} failed market must not contain entries`);
    }
  }

  if (snapshot.successfulMarkets != null && snapshot.successfulMarkets !== successful) {
    fail(`${file} successfulMarkets=${snapshot.successfulMarkets} but counted ${successful}`);
  }
  if (snapshot.freshMarkets != null && snapshot.freshMarkets !== fresh) {
    fail(`${file} freshMarkets=${snapshot.freshMarkets} but counted ${fresh}`);
  }
  if (snapshot.runStatus) {
    const expectedRunStatus = fresh === expectedMarkets.length ? 'complete' : successful > 0 ? 'partial' : 'failed';
    if (snapshot.runStatus !== expectedRunStatus) fail(`${file} runStatus=${snapshot.runStatus}, expected ${expectedRunStatus}`);
  }
  return { snapshotDate, chartDepth };
}

const latest = readJson(latestPath);
const latestMeta = validateSnapshot(latest, 'latest.json');
const index = readJson(indexPath);
if (!Array.isArray(index.snapshots) || index.snapshots.length === 0) fail('index.json has no snapshots');
if (index.snapshots[0]?.date !== latestMeta.snapshotDate) fail(`index head ${index.snapshots[0]?.date} does not match latest ${latestMeta.snapshotDate}`);

const seenDates = new Set();
for (const item of index.snapshots) {
  if (!item?.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) fail('index contains invalid date');
  if (seenDates.has(item.date)) fail(`index contains duplicate date ${item.date}`);
  seenDates.add(item.date);
  if (item.chartDepth != null && (!Number.isInteger(item.chartDepth) || item.chartDepth < 10 || item.chartDepth > maxChartDepth)) {
    fail(`index ${item.date} has invalid chartDepth ${item.chartDepth}`);
  }
  const historyPath = path.join(root, 'history', `${item.date}.json`);
  if (!fs.existsSync(historyPath)) fail(`index references missing history/${item.date}.json`);
  const history = readJson(historyPath);
  const historyMeta = validateSnapshot(history, `history/${item.date}.json`, item.date);
  if (item.chartDepth != null && item.chartDepth !== historyMeta.chartDepth) {
    fail(`index ${item.date} chartDepth=${item.chartDepth} but history declares ${historyMeta.chartDepth}`);
  }
}

if (index.snapshots[0]?.chartDepth != null && index.snapshots[0].chartDepth !== latestMeta.chartDepth) {
  fail(`index head chartDepth=${index.snapshots[0].chartDepth} does not match latest ${latestMeta.chartDepth}`);
}

const latestHistory = readJson(path.join(root, 'history', `${latestMeta.snapshotDate}.json`));
if (JSON.stringify(latestHistory) !== JSON.stringify(latest)) fail(`latest.json differs from history/${latestMeta.snapshotDate}.json`);

console.log(`Radar data OK: ${index.snapshots.length} dated snapshot(s), latest=${latestMeta.snapshotDate}, depth=${latestMeta.chartDepth}`);
