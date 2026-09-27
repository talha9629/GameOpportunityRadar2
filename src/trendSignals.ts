import { z } from 'zod';

export const TrendWindowSchema = z.object({
  days: z.union([z.literal(1), z.literal(3), z.literal(7)]),
  targetDate: z.string(),
  status: z.enum(['available', 'history_missing', 'not_ranked', 'market_failed']),
  priorRank: z.number().int().positive().nullable(),
  currentRank: z.number().int().positive(),
  delta: z.number().int().nullable(),
});

export const TrendStateSchema = z.enum(['EMERGING', 'RISING', 'ESTABLISHED', 'DECLINING', 'INSUFFICIENT_DATA']);

export const TrendSignalSchema = z.object({
  appId: z.string().min(1),
  name: z.string().min(1),
  publisher: z.string(),
  rank: z.number().int().positive(),
  chartDepth: z.number().int().positive().max(100),
  visibility: z.number().min(0).max(1),
  daysObserved: z.number().int().positive(),
  bestObservedRank: z.number().int().positive(),
  exactWindows: z.object({
    '1d': TrendWindowSchema,
    '3d': TrendWindowSchema,
    '7d': TrendWindowSchema,
  }),
  trend: z.object({
    state: TrendStateSchema,
    reason: z.string().min(20),
    evidenceDays: z.array(z.union([z.literal(1), z.literal(3), z.literal(7)])),
  }),
});

const TrendMarketSchema = z.object({
  country: z.string().min(2),
  label: z.string().min(1),
  status: z.string(),
  sourceMode: z.string().nullable(),
  gameFocused: z.boolean(),
  signals: z.array(TrendSignalSchema),
});

export const TrendSignalsPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  radarGeneratedAt: z.string(),
  radarDate: z.string(),
  chart: z.literal('top-free'),
  category: z.literal('Games'),
  chartDepth: z.number().int().positive().max(100),
  statement: z.string().min(40),
  method: z.object({
    name: z.literal('exact_rank_trend_signals_v1'),
    lookbackDays: z.array(z.union([z.literal(1), z.literal(3), z.literal(7)])).length(3),
    visibilityFormula: z.literal('ln((N+1)/rank)/ln(N+1)'),
    statesEmitted: z.array(TrendStateSchema),
    statesReservedForOtherEvidence: z.array(z.enum(['CROWDED', 'WINDOW_CLOSING'])),
    missingHistoryRule: z.string().min(20),
  }),
  summary: z.object({
    marketCount: z.number().int().nonnegative(),
    healthyGameMarkets: z.number().int().nonnegative(),
    signalCount: z.number().int().nonnegative(),
    stateCounts: z.record(z.string(), z.number().int().nonnegative()),
  }),
  markets: z.record(z.string(), TrendMarketSchema),
});

export type TrendSignal = z.infer<typeof TrendSignalSchema>;
export type TrendSignalsPayload = z.infer<typeof TrendSignalsPayloadSchema>;

export async function loadTrendSignals(): Promise<TrendSignalsPayload> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/radar/trend-signals.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Trend signals request failed (${response.status}).`);
  return TrendSignalsPayloadSchema.parse(await response.json());
}

export function strongestTrendSignals(payload: TrendSignalsPayload, limit = 12) {
  const statePriority: Record<TrendSignal['trend']['state'], number> = {
    EMERGING: 0,
    RISING: 1,
    ESTABLISHED: 2,
    DECLINING: 3,
    INSUFFICIENT_DATA: 4,
  };

  return Object.values(payload.markets)
    .filter((market) => market.status === 'ok' && market.gameFocused)
    .flatMap((market) => market.signals.map((signal) => ({ ...signal, market: market.label, country: market.country })))
    .filter((signal) => signal.trend.state !== 'INSUFFICIENT_DATA')
    .sort((a, b) =>
      statePriority[a.trend.state] - statePriority[b.trend.state]
      || b.visibility - a.visibility
      || a.rank - b.rank,
    )
    .slice(0, limit);
}
