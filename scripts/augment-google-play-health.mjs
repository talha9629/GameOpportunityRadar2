import fs from 'node:fs';
import path from 'node:path';
import { deriveGooglePlayHealth } from './google-play-health.mjs';

const healthPath = path.resolve('public/data/health/latest.json');
const googlePlayPath = path.resolve('public/data/platforms/google-play/latest.json');

function read(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { return { __readError: String(error) }; }
}

const health = read(healthPath);
const googlePlay = read(googlePlayPath);
if (health.__readError) throw new Error(`Data Health must be generated before Google Play augmentation: ${health.__readError}`);

const derived = deriveGooglePlayHealth(googlePlay, Date.now());
health.components = [
  ...(Array.isArray(health.components) ? health.components.filter((item) => item?.id !== 'google_play_radar') : []),
  derived.component,
];
health.facts = { ...(health.facts ?? {}), ...derived.facts };
health.recommendedActions = (Array.isArray(health.recommendedActions) ? health.recommendedActions : [])
  .filter((action) => !['OPTIONAL_CONFIGURE_GOOGLE_PLAY_DISCOVERY', 'FIX_GOOGLE_PLAY_DISCOVERY_HEALTH'].includes(action?.action));
if (derived.recommendedAction) health.recommendedActions.push(derived.recommendedAction);
health.recommendedActions.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

fs.writeFileSync(healthPath, `${JSON.stringify(health, null, 2)}\n`, 'utf8');
console.log(`[google-play-health] ${derived.component.state} · ${derived.facts.googlePlayRadarStatus} · ${derived.facts.googlePlayRadarEntryCount}/${derived.facts.googlePlayRadarRequestedDepth} positions`);
