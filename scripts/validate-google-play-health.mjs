import fs from 'node:fs';
import path from 'node:path';

const health = JSON.parse(fs.readFileSync(path.resolve('public/data/health/latest.json'), 'utf8'));
const googlePlay = JSON.parse(fs.readFileSync(path.resolve('public/data/platforms/google-play/latest.json'), 'utf8'));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

const component = (health.components ?? []).find((item) => item?.id === 'google_play_radar');
assert(Boolean(component), 'google_play_radar health component missing');
assert(['healthy', 'degraded', 'optional'].includes(component?.state), 'google_play_radar state must be healthy, degraded, or optional');
assert(component?.label === 'Google Play Discovery · AppBrain', 'google_play_radar label must distinguish discovery from estimate enrichment');
assert(component?.facts?.some((fact) => /not official Google Play storefront ranks/i.test(fact)), 'Google Play health must expose provider-position boundary');
assert(component?.facts?.some((fact) => /third-party estimates/i.test(fact)), 'Google Play health must expose download-estimate boundary');

assert(typeof health.facts?.googlePlayRadarConfigured === 'boolean', 'googlePlayRadarConfigured invalid');
assert(['unconfigured', 'ok', 'failed', 'unavailable'].includes(health.facts?.googlePlayRadarStatus), 'googlePlayRadarStatus invalid');
assert(health.facts?.googlePlayRadarProvider === 'AppBrain', 'googlePlayRadarProvider must be AppBrain');
assert(Number.isInteger(health.facts?.googlePlayRadarEntryCount) && health.facts.googlePlayRadarEntryCount >= 0 && health.facts.googlePlayRadarEntryCount <= 50, 'googlePlayRadarEntryCount invalid');
assert(health.facts?.googlePlayRadarRequestedDepth === 50, 'googlePlayRadarRequestedDepth must remain 50');
assert(typeof health.facts?.googlePlayRadarExactDepth === 'boolean', 'googlePlayRadarExactDepth invalid');
assert(health.facts?.googlePlayRadarAgeHours == null || (typeof health.facts.googlePlayRadarAgeHours === 'number' && health.facts.googlePlayRadarAgeHours >= 0), 'googlePlayRadarAgeHours invalid');

if (googlePlay.status === 'unconfigured') {
  assert(component?.state === 'optional', 'unconfigured Google Play discovery must be optional');
  assert(health.facts.googlePlayRadarConfigured === false, 'unconfigured Google Play discovery cannot be marked configured');
  assert(health.facts.googlePlayRadarEntryCount === 0, 'unconfigured Google Play discovery cannot expose entries');
}
if (component?.state === 'healthy') {
  assert(googlePlay.status === 'ok', 'healthy Google Play discovery requires provider status ok');
  assert(health.facts.googlePlayRadarConfigured === true, 'healthy Google Play discovery must be configured');
  assert(health.facts.googlePlayRadarExactDepth === true, 'healthy Google Play discovery requires exact-depth proof');
  assert(health.facts.googlePlayRadarEntryCount === 50, 'healthy Google Play discovery requires all 50 provider positions');
}
if (googlePlay.status === 'failed') {
  assert(component?.state === 'degraded', 'failed Google Play provider state must be degraded');
}

const essentialIds = new Set(['apple_radar', 'trend_signals', 'research_queue', 'verification_queue', 'policy_watch']);
assert(!essentialIds.has('google_play_radar'), 'Google Play discovery must remain non-essential while AppBrain is optional');
assert(health.essentialCount === 5, 'Google Play discovery must not change the five essential pipelines');
assert(!/google play rank|official google downloads|apple.*as google/i.test(JSON.stringify(component ?? {})), 'Google Play health contains an unsafe cross-store or official-rank claim');

if (errors.length) {
  console.error('[google-play-health] validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`[google-play-health] validation PASS · ${component.state} · ${health.facts.googlePlayRadarStatus} · ${health.facts.googlePlayRadarEntryCount}/50 provider positions`);
