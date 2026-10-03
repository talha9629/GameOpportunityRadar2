import fs from 'node:fs';
import path from 'node:path';

const radarPath = path.resolve('public/data/radar/latest.json');
const metadataPath = path.resolve('data/apple-metadata.json');
const historyPath = path.resolve('data/apple-rating-history.json');
const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
const batchSize = 200;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

const radar = readJson(radarPath, null);
const radarDate = radar?.generatedAt?.slice(0, 10);
if (!radarDate || !radar?.markets) throw new Error('A valid latest Apple Radar snapshot is required.');

const ids = [...new Set(Object.values(radar.markets).flatMap((market) =>
  (market?.entries ?? []).slice(0, 100).map((entry) => String(entry.appId)),
))].sort();
const now = new Date();
const existing = readJson(metadataPath, { schemaVersion: 1, apps: {} });
const apps = existing?.apps && typeof existing.apps === 'object' ? existing.apps : {};
const staleIds = ids.filter((id) => {
  const fetchedAt = apps[id]?.fetchedAt;
  const age = fetchedAt ? now.getTime() - new Date(fetchedAt).getTime() : Number.POSITIVE_INFINITY;
  return !Number.isFinite(age) || age < 0 || age >= maxAgeMs;
});

for (let offset = 0; offset < staleIds.length; offset += batchSize) {
  const batch = staleIds.slice(offset, offset + batchSize);
  const url = new URL('https://itunes.apple.com/lookup');
  url.searchParams.set('id', batch.join(','));
  url.searchParams.set('country', 'us');
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`iTunes Lookup failed (${response.status}) for batch starting at ${offset}.`);
  const payload = await response.json();
  const byId = new Map((payload.results ?? []).map((result) => [String(result.trackId), result]));
  for (const id of batch) {
    const result = byId.get(id);
    apps[id] = {
      fetchedAt: now.toISOString(),
      genres: Array.isArray(result?.genres) ? result.genres : null,
      primaryGenreName: result?.primaryGenreName ?? null,
      releaseDate: result?.releaseDate ?? null,
      currentVersionReleaseDate: result?.currentVersionReleaseDate ?? null,
      userRatingCount: Number.isFinite(result?.userRatingCount) ? result.userRatingCount : null,
      averageUserRating: Number.isFinite(result?.averageUserRating) ? result.averageUserRating : null,
      missing: result ? [
        ...(!Array.isArray(result.genres) ? ['genres'] : []),
        ...(result.primaryGenreName == null ? ['primaryGenreName'] : []),
        ...(result.releaseDate == null ? ['releaseDate'] : []),
        ...(result.currentVersionReleaseDate == null ? ['currentVersionReleaseDate'] : []),
        ...(!Number.isFinite(result.userRatingCount) ? ['userRatingCount'] : []),
        ...(!Number.isFinite(result.averageUserRating) ? ['averageUserRating'] : []),
      ] : ['lookupResult'],
    };
  }
}

const history = readJson(historyPath, { schemaVersion: 1, snapshots: {} });
if (!history.snapshots || typeof history.snapshots !== 'object') history.snapshots = {};
if (!history.missing || typeof history.missing !== 'object') history.missing = {};
history.snapshots[radarDate] = Object.fromEntries(ids.map((id) => [id, apps[id]?.userRatingCount ?? null]));
history.missing[radarDate] = ids.filter((id) => apps[id]?.userRatingCount == null).map((id) => `${id}.userRatingCount`);

fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
fs.writeFileSync(metadataPath, `${JSON.stringify({ schemaVersion: 1, generatedAt: now.toISOString(), apps }, null, 2)}\n`);
fs.writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
console.log(`[apple-metadata] ${ids.length} chart IDs · ${staleIds.length} refreshed · ${radarDate} rating snapshot`);
