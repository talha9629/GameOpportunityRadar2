function hoursSince(value, now) {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 3_600_000) : null;
}

export function deriveGooglePlayHealth(googlePlay, now = Date.now()) {
  const readFailed = Boolean(googlePlay?.__readError);
  const status = readFailed ? 'unavailable' : (googlePlay?.status ?? 'unconfigured');
  const entries = Array.isArray(googlePlay?.entries) ? googlePlay.entries : [];
  const requested = googlePlay?.source?.requestedDepth ?? googlePlay?.chartDepth ?? 50;
  const ageHours = hoursSince(googlePlay?.observedAt ?? googlePlay?.generatedAt, now);
  const exactDepth = status === 'ok'
    && entries.length === requested
    && googlePlay?.completeness?.requested === requested
    && googlePlay?.completeness?.received === requested
    && googlePlay?.completeness?.uniquePackages === requested
    && googlePlay?.completeness?.exactDepthSatisfied === true;

  const state = status === 'unconfigured'
    ? 'optional'
    : status === 'ok' && exactDepth && ageHours != null && ageHours <= 96
      ? 'healthy'
      : 'degraded';

  const component = {
    id: 'google_play_radar',
    label: 'Google Play Discovery · AppBrain',
    state,
    facts: [
      `provider status ${status}`,
      `${entries.length}/${requested} AppBrain popularity position(s) available`,
      exactDepth ? `exact requested depth ${requested}/${requested} verified` : 'exact requested depth not currently available',
      ageHours == null ? 'provider observation age unknown' : `${ageHours.toFixed(1)}h provider observation age`,
      'Positions are AppBrain provider-global popularity ordering, not official Google Play storefront ranks.',
      'Download values, when present, are third-party estimates and are never inferred from Apple ranks.',
    ],
    action: state === 'healthy'
      ? null
      : status === 'unconfigured'
        ? 'Optional only: configure APPBRAIN_API_KEY to enable platform-scoped Google Play discovery.'
        : 'Inspect the AppBrain Google Play collector before relying on Android discovery candidates.',
  };

  const recommendedAction = state === 'healthy'
    ? null
    : status === 'unconfigured'
      ? {
          priority: 9,
          action: 'OPTIONAL_CONFIGURE_GOOGLE_PLAY_DISCOVERY',
          why: 'Google Play discovery is optional and currently unconfigured; no Android candidates are inferred from Apple evidence.',
        }
      : {
          priority: 6,
          action: 'FIX_GOOGLE_PLAY_DISCOVERY_HEALTH',
          why: `The optional Google Play discovery source is ${status} or lacks a fresh exact-depth AppBrain snapshot; Apple/core evidence remains independent.`,
        };

  return {
    component,
    recommendedAction,
    facts: {
      googlePlayRadarConfigured: status !== 'unconfigured' && status !== 'unavailable',
      googlePlayRadarStatus: status,
      googlePlayRadarProvider: googlePlay?.source?.provider ?? 'AppBrain',
      googlePlayRadarEntryCount: entries.length,
      googlePlayRadarRequestedDepth: requested,
      googlePlayRadarExactDepth: exactDepth,
      googlePlayRadarAgeHours: ageHours,
    },
  };
}
