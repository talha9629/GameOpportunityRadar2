import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('public/data/platforms/google-play/latest.json');
if (!fs.existsSync(file)) {
  console.log('[google-play] no generated file yet; validation skipped until first collector run.');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = (message) => { throw new Error(`Google Play Radar validation failed: ${message}`); };

if (data.schemaVersion !== 1) fail('schemaVersion must be 1');
if (data.platform !== 'google_play') fail('platform must be google_play');
if (!['unconfigured', 'ok', 'failed'].includes(data.status)) fail(`invalid status ${data.status}`);
if (data.source?.provider !== 'AppBrain') fail('provider must be AppBrain');
if (data.source?.origin !== 'third_party_public') fail('rank origin must be third_party_public');
if (data.source?.estimateOrigin !== 'third_party_estimate') fail('estimate origin must be third_party_estimate');
if (data.source?.countryScope !== 'provider_global_not_country_specific') fail('country scope must not imply a storefront market');
if (data.source?.creditsPerRun !== 12) fail('creditsPerRun must remain 12 for the 50-result browse budget');
if (!Array.isArray(data.limitations) || data.limitations.length < 4) fail('limitations are required');

if (data.status === 'ok') {
  if (!Array.isArray(data.entries) || data.entries.length < 10 || data.entries.length > 50) fail('ok state must contain 10-50 entries');
  const packages = new Set();
  data.entries.forEach((entry, index) => {
    if (entry.rank !== index + 1) fail(`rank sequence broken at ${index + 1}`);
    if (!entry.packageName || packages.has(entry.packageName)) fail(`missing/duplicate package ${entry.packageName}`);
    packages.add(entry.packageName);
    if (!entry.storeUrl?.startsWith('https://play.google.com/store/apps/details?id=')) fail(`invalid Google Play URL for ${entry.packageName}`);
    if (entry.evidence?.rank !== 'third_party_public') fail(`rank provenance missing for ${entry.packageName}`);
    if (entry.evidence?.downloads !== 'third_party_estimate') fail(`download estimate provenance missing for ${entry.packageName}`);
    if (!Number.isInteger(entry.observations) || entry.observations < 1) fail(`invalid observations for ${entry.packageName}`);
    if (entry.previousObservedRank != null && (!Number.isInteger(entry.previousObservedRank) || entry.previousObservedRank < 1)) fail(`invalid previousObservedRank for ${entry.packageName}`);
    if (entry.observedDelta != null && !Number.isInteger(entry.observedDelta)) fail(`invalid observedDelta for ${entry.packageName}`);
    if (entry.observationGapDays != null && (!Number.isInteger(entry.observationGapDays) || entry.observationGapDays < 0)) fail(`invalid observationGapDays for ${entry.packageName}`);
    if (entry.previousObservedRank == null && entry.observedDelta != null) fail(`delta without previous observation for ${entry.packageName}`);
  });
} else if (Array.isArray(data.entries) && data.entries.length !== 0) {
  fail(`${data.status} state must not expose fresh entries`);
}

const raw = JSON.stringify(data);
if (/official google (rank|downloads)|google download count|1d delta/i.test(raw)) fail('unsafe Google claim or daily-cadence claim detected');
console.log(`[google-play] validation PASS · status=${data.status} · entries=${data.entries?.length ?? 0}`);
