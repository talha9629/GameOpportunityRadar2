export const MIN_TREND_HISTORY_DAYS = 7;

export function subtractUtcDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export function consecutiveSnapshotDays(index, currentDate) {
  if (typeof currentDate !== 'string' || currentDate.length < 10) return 0;
  const dates = new Set((index?.snapshots ?? []).map((item) => item?.date).filter(Boolean));
  dates.add(currentDate);
  let count = 0;
  while (dates.has(subtractUtcDays(currentDate, count))) count += 1;
  return count;
}

export function assessTrend(entry, windows, consecutiveHistoryDays) {
  const oneDayAvailable = windows['1d']?.status === 'available';
  const oneDayFact = oneDayAvailable
    ? ` The exact 1-day move is ${windows['1d'].delta > 0 ? '+' : ''}${windows['1d'].delta}, but 1-day movement alone does not assign a mature trend state.`
    : '';

  if (consecutiveHistoryDays < MIN_TREND_HISTORY_DAYS) {
    return {
      state: 'INSUFFICIENT_DATA',
      reason: `Only ${consecutiveHistoryDays}/${MIN_TREND_HISTORY_DAYS} consecutive exact daily snapshots are available. Exact movement facts remain visible, but no emerging, rising, established, or declining state is assigned before the history maturity gate.${oneDayFact}`,
      evidenceDays: [],
    };
  }

  const threeDay = windows['3d'];
  const sevenDay = windows['7d'];

  if (threeDay.status === 'not_ranked' && entry.rank <= 20) {
    return { state: 'EMERGING', reason: `Entered the tracked Games range at #${entry.rank}; the comparable exact 3-day chart did not contain the title after the 7-day history maturity gate was satisfied.`, evidenceDays: [3] };
  }
  if (threeDay.status === 'available' && (threeDay.delta ?? 0) >= 5) {
    return { state: 'RISING', reason: `Rank improved ${threeDay.delta} places over the exact 3-day window after the 7-day history maturity gate was satisfied.`, evidenceDays: [3] };
  }
  if (threeDay.status === 'available' && (threeDay.delta ?? 0) <= -5) {
    return { state: 'DECLINING', reason: `Rank fell ${Math.abs(threeDay.delta)} places over the exact 3-day window after the 7-day history maturity gate was satisfied.`, evidenceDays: [3] };
  }
  if (
    (entry.daysObserved ?? 0) >= MIN_TREND_HISTORY_DAYS
    && entry.rank <= 30
    && threeDay.status === 'available'
    && sevenDay.status === 'available'
    && Math.abs(threeDay.delta ?? 0) < 5
    && Math.abs(sevenDay.delta ?? 0) < 8
  ) {
    return { state: 'ESTABLISHED', reason: `Observed for ${entry.daysObserved} consecutive daily snapshots at #${entry.rank}; exact 3-day and 7-day movement is comparatively stable.`, evidenceDays: [3, 7] };
  }

  const gap = Object.values(windows).some((signal) => signal.status === 'coverage_gap');
  const mismatch = Object.values(windows).some((signal) => signal.status === 'source_mismatch');
  return {
    state: 'INSUFFICIENT_DATA',
    reason: gap
      ? `At least one exact comparison falls outside a shallower historical chart depth, so absence remains unknown.${oneDayFact}`
      : mismatch
        ? `At least one exact comparison uses an incompatible chart source, so no directional trend is inferred from that window.${oneDayFact}`
        : `Exact mature history does not meet the evidence gate for emerging, rising, established, or declining.${oneDayFact}`,
    evidenceDays: [],
  };
}
