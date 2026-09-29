import { MIN_TREND_HISTORY_DAYS } from './trend-state.mjs';

export function applyResearchTrendMaturity(trend, consecutiveHistoryDays) {
  const base = {
    ...trend,
    consecutiveHistoryDays,
    minimumConsecutiveHistoryDays: MIN_TREND_HISTORY_DAYS,
  };

  if (consecutiveHistoryDays >= MIN_TREND_HISTORY_DAYS) return base;

  return {
    ...base,
    state: 'INSUFFICIENT_DATA',
    rationale: [
      `Only ${consecutiveHistoryDays}/${MIN_TREND_HISTORY_DAYS} consecutive exact daily snapshots are available. Aggregate 1-day/3-day movement facts may still order research work, but no mature trend state is assigned yet.`,
    ],
  };
}
