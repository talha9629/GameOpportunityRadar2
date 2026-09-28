import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveGooglePlayHealth } from './google-play-health.mjs';

const now = Date.parse('2026-09-28T12:00:00Z');

function base(status) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-28T04:25:00Z',
    observedAt: status === 'ok' ? '2026-09-28T04:25:00Z' : undefined,
    status,
    chartDepth: 50,
    source: { provider: 'AppBrain', requestedDepth: 50 },
    entries: [],
  };
}

test('unconfigured Google Play discovery is optional and does not invent entries', () => {
  const derived = deriveGooglePlayHealth(base('unconfigured'), now);
  assert.equal(derived.component.state, 'optional');
  assert.equal(derived.facts.googlePlayRadarConfigured, false);
  assert.equal(derived.facts.googlePlayRadarEntryCount, 0);
  assert.equal(derived.recommendedAction.action, 'OPTIONAL_CONFIGURE_GOOGLE_PLAY_DISCOVERY');
});

test('fresh exact-depth AppBrain snapshot is healthy', () => {
  const value = base('ok');
  value.entries = Array.from({ length: 50 }, (_, index) => ({ packageName: `pkg.${index}` }));
  value.completeness = { requested: 50, received: 50, uniquePackages: 50, exactDepthSatisfied: true };
  const derived = deriveGooglePlayHealth(value, now);
  assert.equal(derived.component.state, 'healthy');
  assert.equal(derived.facts.googlePlayRadarExactDepth, true);
  assert.equal(derived.facts.googlePlayRadarEntryCount, 50);
  assert.equal(derived.recommendedAction, null);
});

test('failed or incomplete provider state is degraded but remains non-core', () => {
  const failed = deriveGooglePlayHealth(base('failed'), now);
  assert.equal(failed.component.state, 'degraded');
  assert.equal(failed.recommendedAction.action, 'FIX_GOOGLE_PLAY_DISCOVERY_HEALTH');

  const partial = base('ok');
  partial.entries = Array.from({ length: 49 }, (_, index) => ({ packageName: `pkg.${index}` }));
  partial.completeness = { requested: 50, received: 49, uniquePackages: 49, exactDepthSatisfied: false };
  const partialDerived = deriveGooglePlayHealth(partial, now);
  assert.equal(partialDerived.component.state, 'degraded');
  assert.equal(partialDerived.facts.googlePlayRadarExactDepth, false);
});

test('stale successful provider observation degrades without changing evidence semantics', () => {
  const value = base('ok');
  value.generatedAt = '2026-09-20T04:25:00Z';
  value.observedAt = '2026-09-20T04:25:00Z';
  value.entries = Array.from({ length: 50 }, (_, index) => ({ packageName: `pkg.${index}` }));
  value.completeness = { requested: 50, received: 50, uniquePackages: 50, exactDepthSatisfied: true };
  const derived = deriveGooglePlayHealth(value, now);
  assert.equal(derived.component.state, 'degraded');
  assert.equal(derived.facts.googlePlayRadarExactDepth, true);
});
