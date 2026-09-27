import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('public/data/platforms/google-play');
const latestPath = path.join(root, 'latest.json');
const historyDir = path.join(root, 'history');
if (!fs.existsSync(latestPath)) {
  console.log('[google-play] no generated file yet; validation skipped until first collector run.');
  process.exit(0);
}

const fail = (message) => { throw new Error(`Google Play Radar validation failed: ${message}`); };

function validateSnapshot(data, label) {
  if (data.schemaVersion !== 1) fail(`${label}: schemaVersion must be 1`);
  if (data.platform !== 'google_play') fail(`${label}: platform must be google_play`);
  if (!['unconfigured', 'ok', 'failed'].includes(data.status)) fail(`${label}: invalid status ${data.status}`);
  if (data.chartDepth !== 50) fail(`${label}: chartDepth must be 50`);
  if (data.source?.provider !== 'AppBrain') fail(`${label}: provider must be AppBrain`);
  if (data.source?.origin !== 'third_party_public') fail(`${label}: rank origin must be third_party_public`);
  if (data.source?.estimateOrigin !== 'third_party_estimate') fail(`${label}: estimate origin must be third_party_estimate`);
  if (data.source?.orderingSemantics !== 'provider_popularity_position') fail(`${label}: ordering semantics must be provider_popularity_position`);
  if (data.source?.countryScope !== 'provider_global_not_country_specific') fail(`${label}: country scope must not imply a storefront market`);
  if (data.source?.requestedDepth !== 50) fail(`${label}: requestedDepth must be 50`);
  if (data.source?.completenessPolicy !== 'exact_requested_depth_required') fail(`${label}: completeness policy must fail closed on partial provider responses`);
  if (data.source?.creditsPerRun !== 12) fail(`${label}: creditsPerRun must remain 12 for the 50-result browse budget`);
  if (!Array.isArray(data.limitations) || data.limitations.length < 5) fail(`${label}: limitations are required`);

  if (data.status === 'ok') {
    if (!Array.isArray(data.entries) || data.entries.length !== data.chartDepth) fail(`${label}: ok state must contain exactly ${data.chartDepth} entries`);
    if (data.completeness?.requested !== data.chartDepth
      || data.completeness?.received !== data.chartDepth
      || data.completeness?.uniquePackages !== data.chartDepth
      || data.completeness?.exactDepthSatisfied !== true) {
      fail(`${label}: exact-depth completeness proof is missing or inconsistent`);
    }
    const packages = new Set();
    data.entries.forEach((entry, index) => {
      if (entry.rank !== index + 1) fail(`${label}: rank sequence broken at ${index + 1}`);
      if (entry.rankSemantics !== 'appbrain_popularity_position') fail(`${label}: unsafe rank semantics for ${entry.packageName ?? index + 1}`);
      if (!entry.packageName || packages.has(entry.packageName)) fail(`${label}: missing/duplicate package ${entry.packageName}`);
      packages.add(entry.packageName);
      if (!entry.storeUrl?.startsWith('https://play.google.com/store/apps/details?id=')) fail(`${label}: invalid Google Play URL for ${entry.packageName}`);
      if (entry.evidence?.rank !== 'third_party_public') fail(`${label}: provider-order provenance missing for ${entry.packageName}`);
      if (entry.evidence?.downloads !== 'third_party_estimate') fail(`${label}: download estimate provenance missing for ${entry.packageName}`);
      if (!Number.isInteger(entry.observations) || entry.observations < 1) fail(`${label}: invalid observations for ${entry.packageName}`);
      if (entry.previousObservedRank != null && (!Number.isInteger(entry.previousObservedRank) || entry.previousObservedRank < 1 || entry.previousObservedRank > data.chartDepth)) fail(`${label}: invalid previousObservedRank for ${entry.packageName}`);
      if (entry.observedDelta != null && !Number.isInteger(entry.observedDelta)) fail(`${label}: invalid observedDelta for ${entry.packageName}`);
      if (entry.observationGapDays != null && (!Number.isInteger(entry.observationGapDays) || entry.observationGapDays < 0)) fail(`${label}: invalid observationGapDays for ${entry.packageName}`);
      if (entry.previousObservedRank == null && entry.observedDelta != null) fail(`${label}: delta without previous observation for ${entry.packageName}`);
      if (entry.previousObservedRank != null && entry.observedDelta !== entry.previousObservedRank - entry.rank) fail(`${label}: delta arithmetic mismatch for ${entry.packageName}`);
    });
    if (packages.size !== data.chartDepth) fail(`${label}: unique package coverage is incomplete`);
  } else if (Array.isArray(data.entries) && data.entries.length !== 0) {
    fail(`${label}: ${data.status} state must not expose fresh entries`);
  }

  const raw = JSON.stringify(data);
  if (/official google (rank|downloads)|google download count|google play rank|1d delta/i.test(raw)) fail(`${label}: unsafe Google claim or daily-cadence claim detected`);
}

const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
validateSnapshot(latest, 'latest');

let historyCount = 0;
if (fs.existsSync(historyDir)) {
  for (const name of fs.readdirSync(historyDir).filter((entry) => entry.endsWith('.json')).sort()) {
    const snapshot = JSON.parse(fs.readFileSync(path.join(historyDir, name), 'utf8'));
    validateSnapshot(snapshot, `history/${name}`);
    if (snapshot.status !== 'ok') fail(`history/${name}: history files must only contain successful provider snapshots`);
    historyCount += 1;
  }
}

console.log(`[google-play] validation PASS · status=${latest.status} · entries=${latest.entries?.length ?? 0} · successful history=${historyCount}`);
