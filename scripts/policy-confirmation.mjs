export const POLICY_CONFIRMIRMATION_VERSION = 2;

function parseTime(value) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

export function appendPolicyObservation(log, observation) {
  const next = Array.isArray(log) ? [...log] : [];
  next.push(observation);
  return next;
}

export function advancePolicyCandidate({
  current,
  pendingCandidate,
  fetchedRef,
  observedAt,
  minimumElapsedMs,
}) {
  if (!current) {
    return { kind: 'baseline', current: fetchedRef, pendingCandidate: null, confirmation: null };
  }

  if (fetchedRef.hash === current.hash) {
    return { kind: 'unchanged', current: fetchedRef, pendingCandidate: null, confirmation: null };
  }

  const sameCandidate = pendingCandidate?.hash === fetchedRef.hash
    && pendingCandidate?.normalizationVersion === fetchedRef.normalizationVersion
    && pendingCandidate?.confirmationVersion === POLICY_CONFIRMIRMATION_VERSION;

  if (!sameCandidate) {
    return {
      kind: 'pending_started',
      current,
      pendingCandidate: {
        hash: fetchedRef.hash,
        path: fetchedRef.path,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        observations: 1,
        normalizationVersion: fetchedRef.normalizationVersion,
        confirmationVersion: POLICY_CONFIRMIRMATION_VERSION,
        minimumConfirmationAt: new Date(Date.parse(observedAt) + minimumElapsedMs).toISOString(),
      },
      confirmation: null,
    };
  }

  const observations = (pendingCandidate.observations ?? 1) + 1;
  const firstSeen = parseTime(pendingCandidate.firstSeenAt);
  const observed = parseTime(observedAt);
  const ageMs = firstSeen == null || observed == null ? 0 : Math.max(0, observed - firstSeen);

  if (observations >= 2 && ageMs >= minimumElapsedMs) {
    return {
      kind: 'stable_delta',
      current: fetchedRef,
      pendingCandidate: null,
      confirmation: {
        firstObservedAt: pendingCandidate.firstSeenAt,
        repeatObservedAt: observedAt,
        observations,
        normalizationVersion: fetchedRef.normalizationVersion,
        confirmationVersion: POLICY_CONFIRMIRMATION_VERSION,
      },
    };
  }

  return {
    kind: 'pending_reobserved',
    current,
    pendingCandidate: {
      ...pendingCandidate,
      path: fetchedRef.path,
      lastSeenAt: observedAt,
      observations,
      normalizationVersion: fetchedRef.normalizationVersion,
      confirmationVersion: POLICY_CONFIRMIRMATION_VERSION,
      minimumConfirmationAt: new Date(Date.parse(pendingCandidate.firstSeenAt) + minimumElapsedMs).toISOString(),
    },
    confirmation: null,
  };
}

export function hasUninterruptedRepeatEvidence(log, {
  hash,
  normalizationVersion,
  firstObservedAt,
  repeatObservedAt,
  minimumElapsedMs,
}) {
  const first = parseTime(firstObservedAt);
  const repeat = parseTime(repeatObservedAt);
  if (first == null || repeat == null || repeat - first < minimumElapsedMs) return false;

  const window = (Array.isArray(log) ? log : [])
    .filter((entry) => {
      const at = parseTime(entry?.at);
      return at != null && at >= first && at <= repeat;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  if (window.length < 2) return false;
  if (window.some((entry) => entry.status !== 'success')) return false;
  if (window.some((entry) => entry.hash !== hash || entry.normalizationVersion !== normalizationVersion)) return false;

  const matching = window.filter((entry) => entry.status === 'success' && entry.hash === hash);
  if (matching.length < 2) return false;
  if (matching[0].at !== firstObservedAt) return false;
  if (matching.at(-1)?.at !== repeatObservedAt) return false;
  return true;
}
