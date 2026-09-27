import { createHash } from 'node:crypto';

export const POLICY_CONFIRMATION_VERSION = 2;
export const POLICY_CONFIRMATION_OBSERVATIONS_REQUIRED = 3;
export const POLICY_CONFIRMATION_MIN_MS = 60 * 60 * 1000;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function elapsedMs(firstSeenAt, now) {
  const first = Date.parse(firstSeenAt ?? '');
  const current = Date.parse(now);
  return Number.isFinite(first) && Number.isFinite(current) ? Math.max(0, current - first) : 0;
}

function interruptionFrom(pendingCandidate, now, reason) {
  if (!pendingCandidate) return null;
  return {
    hash: pendingCandidate.hash,
    path: pendingCandidate.path,
    firstSeenAt: pendingCandidate.firstSeenAt,
    lastSeenAt: pendingCandidate.lastSeenAt,
    interruptedAt: now,
    observations: pendingCandidate.observations ?? 1,
    reason,
    confirmationVersion: pendingCandidate.confirmationVersion ?? 1,
  };
}

function startCandidate(fetchedRef, now, normalizationVersion) {
  return {
    hash: fetchedRef.hash,
    path: fetchedRef.path,
    firstSeenAt: now,
    lastSeenAt: now,
    observations: 1,
    observationTimestamps: [now],
    confirmationVersion: POLICY_CONFIRMATION_VERSION,
    normalizationVersion,
    minimumConfirmationAt: new Date(Date.parse(now) + POLICY_CONFIRMATION_MIN_MS).toISOString(),
  };
}

export function interruptPolicyCandidate(pendingCandidate, now, reason = 'fetch_failure') {
  return {
    pendingCandidate: null,
    interruption: interruptionFrom(pendingCandidate, now, reason),
  };
}

export function advancePolicyConfirmation({ sourceId, current, pendingCandidate, fetchedRef, now, normalizationVersion }) {
  if (!current) {
    return { current: fetchedRef, pendingCandidate: null, confirmedChange: null, interruption: null };
  }

  if (fetchedRef.hash === current.hash) {
    return {
      current: fetchedRef,
      pendingCandidate: null,
      confirmedChange: null,
      interruption: interruptionFrom(pendingCandidate, now, 'baseline_reappeared'),
    };
  }

  const compatiblePending = pendingCandidate
    && pendingCandidate.hash === fetchedRef.hash
    && pendingCandidate.confirmationVersion === POLICY_CONFIRMATION_VERSION
    && pendingCandidate.normalizationVersion === normalizationVersion
    && Array.isArray(pendingCandidate.observationTimestamps)
    && pendingCandidate.observationTimestamps.length === pendingCandidate.observations
    && pendingCandidate.observationTimestamps.length >= 1;

  if (!compatiblePending) {
    return {
      current,
      pendingCandidate: startCandidate(fetchedRef, now, normalizationVersion),
      confirmedChange: null,
      interruption: pendingCandidate ? interruptionFrom(pendingCandidate, now, 'different_successful_hash') : null,
    };
  }

  const observationTimestamps = [...pendingCandidate.observationTimestamps, now];
  const observations = observationTimestamps.length;
  const ageMs = elapsedMs(pendingCandidate.firstSeenAt, now);

  if (observations >= POLICY_CONFIRMATION_OBSERVATIONS_REQUIRED && ageMs >= POLICY_CONFIRMATION_MIN_MS) {
    const changeId = sha256(`${sourceId}:${current.hash}:${fetchedRef.hash}`);
    return {
      current: fetchedRef,
      pendingCandidate: null,
      interruption: null,
      confirmedChange: {
        id: changeId,
        fromHash: current.hash,
        toHash: fetchedRef.hash,
        detectedAt: pendingCandidate.firstSeenAt,
        confirmedAt: now,
        observations,
        observationTimestamps,
        confirmationStatus: 'confirmed_repeat',
        confirmationVersion: POLICY_CONFIRMATION_VERSION,
        consecutiveSuccessfulObservations: true,
        normalizationVersion,
        fromPath: current.path,
        toPath: fetchedRef.path,
      },
    };
  }

  return {
    current,
    confirmedChange: null,
    interruption: null,
    pendingCandidate: {
      ...pendingCandidate,
      path: fetchedRef.path,
      lastSeenAt: now,
      observations,
      observationTimestamps,
      confirmationVersion: POLICY_CONFIRMATION_VERSION,
      normalizationVersion,
      minimumConfirmationAt: new Date(Date.parse(pendingCandidate.firstSeenAt) + POLICY_CONFIRMATION_MIN_MS).toISOString(),
    },
  };
}
