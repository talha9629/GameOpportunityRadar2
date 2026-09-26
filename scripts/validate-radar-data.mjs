import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('public/data/radar');
const latestPath = path.join(root, 'latest.json');
const indexPath = path.join(root, 'index.json');
const expectedMarkets = ['us', 'gb', 'ca', 'au'];

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

function validateEntry(entry, expectedRank, market, file) {
  if (entry?.rank !== expectedRank) fail(`${file} ${market} rank sequence expected ${expectedRank}, got ${entry?.rank}`);
  if (!String(entry?.appId ?? '').trim()) fail(`${file} ${market} rank ${expectedRank} has no appId`);
  if (!String(entry?.name ?? '').trim()) fail(`${file} ${market} rank ${expectedRank} has no name`);
  if (!Number.isInteger(entry?.daysObserved) || entry.daysObserved < 1) fail(`${file} ${market} rank ${expectedRank} has invalid daysObserved`);
  if (!Number.isInteger(entry?.bestObservedRank) || entry.bestObservedRank < 1) fail(`${file} ${market} rank ${expectedRank} has invalid bestObservedRank`);
  if (!Array.isArray(entry?.events)) fail(`${file} ${market} rank ${expectedRank} events must be an array`);
}

function validateSnapshot(snapshot, file, expectedDate = null) {
  if (!snapshot || typeof snapshot !== 'object') fail(`${file} is not an object`);
  const snapshotDate = dateKey(snapshot.generatedAt);
  if (!snapshotDate) fail(`${file} has invalid generatedAt`);
  if (expectedDate && snapshotDate !== expectedDate) fail(`${file} generatedAt date ${snapshotDate} does not match filename date ${expectedDate}`);
  if (snapshot.category !== 'Games' || snapshot.chart !== 'top-free') fail(`${file} has unexpected chart/category`);
  if (!snapshot.markets || typeof snapshot.markets !== 'object') fail(`${file} has no markets object`);

  let successful = 0;
  let fresh = 0;
  for (const code of expectedMarkets) {
    const market = snapshot.markets[code];
    if (!market) fail(`${file} is missing ${code}`);
    if (!['ok', 'failed'].includes(market.status)) fail(`${file} ${code} has invalid status`);
    if (!Array.isArray(market.entries)) fail(`${file} ${code} entries must be an array`);

    if (market.status === 'ok') {
      successful += 1;
      if (market.entries.length < 10 || market.entries.length > 50) fail(`${file} ${code} successful market has ${market.entries.length} entries`);
      const ids = new Set();
      market.entries.forEach((entry, index) => {
        validateEntry(entry, index + 1, code, file);
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
  return snapshotDate;
}

const latest = readJson(latestPath);
const latestDate = validateSnapshot(latest, 'latest.json');
const index = readJson(indexPath);
if (!Array.isArray(index.snapshots) || index.snapshots.length === 0) fail('index.json has no snapshots');
if (index.snapshots[0]?.date !== latestDate) fail(`index head ${index.snapshots[0]?.date} does not match latest ${latestDate}`);

const seenDates = new Set();
for (const item of index.snapshots) {
  if (!item?.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) fail('index contains invalid date');
  if (seenDates.has(item.date)) fail(`index contains duplicate date ${item.date}`);
  seenDates.add(item.date);
  const historyPath = path.join(root, 'history', `${item.date}.json`);
  if (!fs.existsSync(historyPath)) fail(`index references missing history/${item.date}.json`);
  const history = readJson(historyPath);
  validateSnapshot(history, `history/${item.date}.json`, item.date);
}

const latestHistory = readJson(path.join(root, 'history', `${latestDate}.json`));
if (JSON.stringify(latestHistory) !== JSON.stringify(latest)) fail(`latest.json differs from history/${latestDate}.json`);

console.log(`Radar data OK: ${index.snapshots.length} dated snapshot(s), latest=${latestDate}`);
