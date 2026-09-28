import fs from 'node:fs';
import path from 'node:path';
import {
  selectLatestSuccessfulGooglePlaySnapshot,
  unconfiguredStateIsSemanticallyUnchanged,
} from './google-play-history.mjs';

const root = path.resolve('public/data/platforms/google-play');
const latestPath = path.join(root, 'latest.json');
const historyDir = path.join(root, 'history');
const key = process.env.APPBRAIN_API_KEY?.trim() || '';
const now = new Date();
const generatedAt = now.toISOString();
const today = generatedAt.slice(0, 10);
const chartDepth = 50;
const creditsPerRun = 12; // AppBrain pricing: 4 credits first 10 + 2 per additional 10.

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function readHistorySnapshots() {
  if (!fs.existsSync(historyDir)) return [];
  return fs.readdirSync(historyDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJson(path.join(historyDir, name), null))
    .filter(Boolean);
}

function daysBetweenDates(older, newer) {
  if (!older || !newer) return null;
  const start = new Date(`${older}T00:00:00Z`);
  const end = new Date(`${newer}T00:00:00Z`);
  if (!Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf())) return null;
  return Math.max(0, Math.round((end.valueOf() - start.valueOf()) / 86_400_000));
}

function playUrl(packageName) {
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`;
}

const previous = readJson(latestPath, null);
const previousSuccessful = selectLatestSuccessfulGooglePlaySnapshot(previous, readHistorySnapshots(), chartDepth);
const previousSuccessfulAt = previousSuccessful?.generatedAt ?? null;

const base = {
  schemaVersion: 1,
  generatedAt,
  platform: 'google_play',
  platformLabel: 'Google Play',
  source: {
    provider: 'AppBrain',
    endpoint: 'https://api.appbrain.com/v2/info/browse',
    origin: 'third_party_public',
    estimateOrigin: 'third_party_estimate',
    orderingSemantics: 'provider_popularity_position',
    method: 'AppBrain POPULAR browse ordering for Android apps filtered to the provider GAME category',
    countryScope: 'provider_global_not_country_specific',
    requestedDepth: chartDepth,
    completenessPolicy: 'exact_requested_depth_required',
    creditsPerRun,
    freeMonthlyCreditBudget: 500,
  },
  status: 'unconfigured',
  chartDepth,
  entries: [],
  limitations: [
    'This is AppBrain market intelligence, not an official Google Play top-chart API.',
    'The displayed position is AppBrain provider ordering, not a Google Play storefront chart rank.',
    'Google Play Developer API is not used for competitor discovery because it is designed for apps in the developer account.',
    'estimatedDownloads and estimatedRecentDownloads are third-party estimates, never first-party Google figures.',
    'This provider browse endpoint is not labeled as a country storefront ranking; Radar does not attach US/UK/CA/AU market claims to it.',
    'A successful snapshot requires exactly the requested 50 unique provider results. Partial provider responses fail closed.',
    'Movement compares the previous successful observed AppBrain snapshot and always records the observation gap; it is not called a 1-day move unless the gap is exactly one day.',
  ],
};

if (!key) {
  fs.mkdirSync(historyDir, { recursive: true });
  const output = {
    ...base,
    status: 'unconfigured',
    message: 'APPBRAIN_API_KEY is not configured. Google Play hunting remains unavailable rather than inferred from Apple data.',
    previousSuccessfulAt,
  };
  if (unconfiguredStateIsSemanticallyUnchanged(previous, output)) {
    console.log('[google-play] AppBrain remains unconfigured; provider evidence is unchanged, so no generated-data rewrite is needed.');
    process.exit(0);
  }
  fs.writeFileSync(latestPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log('[google-play] AppBrain unconfigured; wrote truthful provider state without consuming credits.');
  process.exit(0);
}

try {
  const url = new URL('https://api.appbrain.com/v2/info/browse');
  url.searchParams.set('apikey', key);
  url.searchParams.set('platform', 'ANDROID');
  url.searchParams.set('sort', 'POPULAR');
  url.searchParams.set('category', 'GAME');
  url.searchParams.set('limit', String(chartDepth));
  url.searchParams.set('offset', '0');
  url.searchParams.set('format', 'json');

  const response = await fetch(url, { headers: { 'User-Agent': 'GameOpportunityRadar2/1.1' } });
  if (!response.ok) throw new Error(`AppBrain HTTP ${response.status}`);
  const payload = await response.json();
  const apps = Array.isArray(payload?.apps) ? payload.apps : [];
  if (apps.length !== chartDepth) {
    throw new Error(`AppBrain browse returned ${apps.length} apps; exact requested depth ${chartDepth} is required.`);
  }

  const packageNames = apps.map((app) => String(app?.package ?? '').trim());
  if (packageNames.some((packageName) => !packageName)) throw new Error('AppBrain browse returned an app without a package name.');
  if (new Set(packageNames).size !== chartDepth) throw new Error('AppBrain browse returned duplicate package names; snapshot rejected as incomplete.');

  const priorByPackage = new Map((previousSuccessful?.entries ?? []).map((entry) => [entry.packageName, entry]));
  const previousSuccessfulDate = typeof previousSuccessfulAt === 'string' ? previousSuccessfulAt.slice(0, 10) : null;
  const sameSuccessfulDay = previousSuccessfulDate === today;
  const successfulGapDays = daysBetweenDates(previousSuccessfulDate, today);

  const entries = apps.map((app, index) => {
    const packageName = packageNames[index];
    const prior = priorByPackage.get(packageName);
    const previousObservedRank = sameSuccessfulDay ? prior?.previousObservedRank ?? null : prior?.rank ?? null;
    const firstObserved = prior?.firstObserved ?? today;
    const observations = sameSuccessfulDay ? prior?.observations ?? 1 : prior ? (prior.observations ?? 1) + 1 : 1;

    return {
      rank: index + 1,
      rankSemantics: 'appbrain_popularity_position',
      previousObservedRank,
      observedDelta: previousObservedRank == null ? null : previousObservedRank - (index + 1),
      previousObservedAt: prior ? previousSuccessfulAt : null,
      observationGapDays: prior ? (sameSuccessfulDay ? prior.observationGapDays ?? successfulGapDays : successfulGapDays) : null,
      packageName,
      name: app.name ?? packageName,
      publisher: app.developerName ?? 'Publisher unknown',
      category: app.marketCategory ?? null,
      iconUrl: app.iconUrl ?? null,
      storeUrl: playUrl(packageName),
      rating: typeof app.rating === 'number' ? app.rating : null,
      ratingCount: Number.isInteger(app.ratingCount) ? app.ratingCount : null,
      downloadsCategory: app.downloadsCategory ?? null,
      estimatedDownloads: Number.isFinite(app.estimatedDownloads) ? app.estimatedDownloads : null,
      estimatedRecentDownloads: Number.isFinite(app.estimatedRecentDownloads) ? app.estimatedRecentDownloads : null,
      firstObserved,
      observations,
      evidence: {
        rank: 'third_party_public',
        rating: 'third_party_public',
        downloads: 'third_party_estimate',
      },
    };
  });

  const output = {
    ...base,
    status: 'ok',
    observedAt: generatedAt,
    creditsUsedThisRun: creditsPerRun,
    completeness: {
      requested: chartDepth,
      received: entries.length,
      uniquePackages: new Set(entries.map((entry) => entry.packageName)).size,
      exactDepthSatisfied: true,
    },
    entries,
  };

  fs.mkdirSync(historyDir, { recursive: true });
  fs.writeFileSync(latestPath, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(path.join(historyDir, `${today}.json`), `${JSON.stringify(output, null, 2)}\n`);
  console.log(`[google-play] collected exact ${entries.length}/${chartDepth} AppBrain popularity positions · ${creditsPerRun} credits`);
} catch (error) {
  fs.mkdirSync(historyDir, { recursive: true });
  fs.writeFileSync(latestPath, `${JSON.stringify({
    ...base,
    status: 'failed',
    error: String(error),
    previousSuccessfulAt,
  }, null, 2)}\n`);
  console.error(`[google-play] collection failed: ${String(error)}`);
  console.error('[google-play] failed provider state was written and will be validated/committed before the workflow reports failure.');
}
