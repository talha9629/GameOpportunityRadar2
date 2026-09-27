import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('public/data/platforms/google-play');
const latestPath = path.join(root, 'latest.json');
const historyDir = path.join(root, 'history');
const key = process.env.APPBRAIN_API_KEY?.trim() || '';
const now = new Date();
const generatedAt = now.toISOString();
const today = generatedAt.slice(0, 10);
const chartDepth = 50;
const creditsPerRun = 12; // AppBrain: 4 credits first 10 + 2 per additional 10.

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function yesterdayOf(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function playUrl(packageName) {
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`;
}

const previous = readJson(latestPath, null);
const previousDate = typeof previous?.generatedAt === 'string' ? previous.generatedAt.slice(0, 10) : null;
const previousIsYesterday = previousDate === yesterdayOf(today);
const sameDay = previousDate === today;

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
    method: 'POPULAR Android apps filtered to Google Play GAME category by provider query',
    countryScope: 'provider_global_not_country_specific',
    creditsPerRun,
    freeMonthlyCreditBudget: 500,
  },
  status: 'unconfigured',
  chartDepth,
  entries: [],
  limitations: [
    'This is AppBrain market intelligence, not an official Google Play top-chart API.',
    'Google Play Developer API is not used for competitor discovery because it is designed for apps in the developer account.',
    'estimatedDownloads and estimatedRecentDownloads are third-party estimates, never first-party Google figures.',
    'This provider browse endpoint is not labeled as a country storefront ranking; Radar does not attach US/UK/CA/AU market claims to it.',
  ],
};

if (!key) {
  fs.mkdirSync(historyDir, { recursive: true });
  fs.writeFileSync(latestPath, `${JSON.stringify({
    ...base,
    status: 'unconfigured',
    message: 'APPBRAIN_API_KEY is not configured. Google Play hunting remains unavailable rather than inferred from Apple data.',
    previousSuccessfulAt: previous?.status === 'ok' ? previous.generatedAt : previous?.previousSuccessfulAt ?? null,
  }, null, 2)}\n`);
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

  const response = await fetch(url, { headers: { 'User-Agent': 'GameOpportunityRadar2/1.0' } });
  if (!response.ok) throw new Error(`AppBrain HTTP ${response.status}`);
  const payload = await response.json();
  const apps = Array.isArray(payload?.apps) ? payload.apps : [];
  if (apps.length < 10) throw new Error(`AppBrain browse returned only ${apps.length} apps.`);

  const priorByPackage = new Map((Array.isArray(previous?.entries) ? previous.entries : []).map((entry) => [entry.packageName, entry]));
  const entries = apps.slice(0, chartDepth).map((app, index) => {
    const packageName = String(app.package ?? '').trim();
    if (!packageName) throw new Error(`AppBrain result at rank ${index + 1} has no package name.`);
    const prior = priorByPackage.get(packageName);
    const comparablePriorRank = sameDay ? prior?.priorRank ?? null : previousIsYesterday ? prior?.rank ?? null : null;
    const firstObserved = prior?.firstObserved ?? today;
    const daysObserved = sameDay
      ? prior?.daysObserved ?? 1
      : previousIsYesterday && prior
        ? (prior.daysObserved ?? 1) + 1
        : 1;

    return {
      rank: index + 1,
      priorRank: comparablePriorRank,
      delta: comparablePriorRank == null ? null : comparablePriorRank - (index + 1),
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
      daysObserved,
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
    entries,
  };

  fs.mkdirSync(historyDir, { recursive: true });
  fs.writeFileSync(latestPath, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(path.join(historyDir, `${today}.json`), `${JSON.stringify(output, null, 2)}\n`);
  console.log(`[google-play] collected ${entries.length} popular Android games via AppBrain · ${creditsPerRun} credits`);
} catch (error) {
  fs.mkdirSync(historyDir, { recursive: true });
  fs.writeFileSync(latestPath, `${JSON.stringify({
    ...base,
    status: 'failed',
    error: String(error),
    previousSuccessfulAt: previous?.status === 'ok' ? previous.generatedAt : previous?.previousSuccessfulAt ?? null,
  }, null, 2)}\n`);
  console.error(`[google-play] collection failed: ${String(error)}`);
  process.exitCode = 1;
}
