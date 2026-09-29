export function buildDigestCandidateSnapshot(candidate) {
  const trend = candidate?.evidence?.trend ?? {};
  const threeDay = candidate?.evidence?.exactWindows?.['3d'] ?? {};
  return {
    appId: String(candidate?.appId ?? ''),
    name: candidate?.name ?? '',
    iconUrl: candidate?.iconUrl ?? null,
    publisher: candidate?.publisher ?? null,
    queueRank: candidate?.queueRank ?? null,
    researchPriority: candidate?.researchPriority ?? null,
    trendState: trend.state ?? 'INSUFFICIENT_DATA',
    trendRationale: Array.isArray(trend.rationale) ? trend.rationale : [],
    consecutiveHistoryDays: Number.isInteger(trend.consecutiveHistoryDays) ? trend.consecutiveHistoryDays : null,
    minimumConsecutiveHistoryDays: Number.isInteger(trend.minimumConsecutiveHistoryDays) ? trend.minimumConsecutiveHistoryDays : null,
    observedPersistenceDays: Number.isInteger(candidate?.evidence?.maxObservedDays) ? candidate.evidence.maxObservedDays : 0,
    exact3dMovement: {
      status: threeDay.status ?? 'history_missing',
      bestUpwardDelta: Number.isInteger(threeDay.bestUpwardDelta) ? threeDay.bestUpwardDelta : null,
    },
  };
}

export function exactComparisonAvailableEventType(days) {
  if (days !== 3 && days !== 7) throw new Error(`Unsupported exact comparison window: ${days}`);
  return `EXACT_${days}D_COMPARISON_AVAILABLE`;
}
