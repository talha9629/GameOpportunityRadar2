import { z } from 'zod';

const RadarEntrySchema = z.object({
  rank: z.number().int().positive(),
  priorRank: z.number().int().positive().nullable(),
  delta: z.number().int().nullable(),
  appId: z.string().min(1),
  name: z.string().min(1),
  publisher: z.string(),
  iconUrl: z.string().nullable(),
  storeUrl: z.string().nullable(),
  firstObserved: z.string().min(10),
  daysObserved: z.number().int().positive(),
  bestObservedRank: z.number().int().positive(),
  events: z.array(z.string()),
});

const RadarMarketSchema = z.object({
  country: z.string().min(2),
  label: z.string().min(1),
  status: z.enum(['ok', 'failed']),
  sourceMode: z.string().optional(),
  sourceUrl: z.string().optional(),
  gameFocused: z.boolean().optional(),
  warning: z.string().nullable().optional(),
  error: z.string().optional(),
  observedAt: z.string().optional(),
  refreshStatus: z.enum(['fresh', 'preserved_same_day']).optional(),
  entries: z.array(RadarEntrySchema),
});

const RadarSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatedAt: z.string().nullable(),
  chart: z.string(),
  category: z.string(),
  chartDepth: z.number().int().min(10).max(100).optional(),
  runStatus: z.enum(['complete', 'partial', 'failed']).optional(),
  successfulMarkets: z.number().int().nonnegative().optional(),
  markets: z.record(z.string(), RadarMarketSchema),
});

const RadarIndexEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  generatedAt: z.string(),
  successfulMarkets: z.number().int().nonnegative(),
  gameFocusedMarkets: z.number().int().nonnegative(),
  runStatus: z.enum(['complete', 'partial', 'failed']),
  marketStatus: z.record(z.string(), z.enum(['ok', 'failed'])),
});

const RadarIndexSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string(),
  snapshots: z.array(RadarIndexEntrySchema),
});

export type RadarEntry = z.infer<typeof RadarEntrySchema>;
export type RadarMarket = z.infer<typeof RadarMarketSchema>;
export type RadarSnapshot = z.infer<typeof RadarSnapshotSchema>;
export type RadarIndex = z.infer<typeof RadarIndexSchema>;

export interface RadarWindow {
  latest: RadarSnapshot;
  history: RadarSnapshot[];
  index: RadarIndex | null;
}

export type RankWindowStatus = 'available' | 'history_missing' | 'not_ranked' | 'market_failed';

export interface RankWindowChange {
  days: 1 | 3 | 7;
  status: RankWindowStatus;
  delta: number | null;
  priorRank: number | null;
  currentRank: number;
}

export interface HistoryMaturity {
  observedDays: number;
  consecutiveDays: number;
  requiredDays: 7;
  label: 'INSUFFICIENT_DATA' | 'EARLY' | 'BUILDING' | 'MATURE_7D';
}

export type RadarTrendState =
  | 'EMERGING'
  | 'RISING'
  | 'ESTABLISHED'
  | 'CROWDED'
  | 'WINDOW_CLOSING'
  | 'DECLINING'
  | 'INSUFFICIENT_DATA';

export interface RadarTrendAssessment {
  state: RadarTrendState;
  reason: string;
  evidenceDays: Array<1 | 3 | 7>;
}

function dateKey(snapshot: RadarSnapshot) {
  return snapshot.generatedAt?.slice(0, 10) ?? null;
}

function subtractUtcDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

async function fetchJson(path: string) {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Radar data request failed (${response.status}) for ${path}.`);
  return response.json() as Promise<unknown>;
}

export async function loadRadarSnapshot(date?: string): Promise<RadarSnapshot> {
  const path = date ? `data/radar/history/${date}.json` : 'data/radar/latest.json';
  return RadarSnapshotSchema.parse(await fetchJson(path));
}

export async function loadRadarIndex(): Promise<RadarIndex> {
  return RadarIndexSchema.parse(await fetchJson('data/radar/index.json'));
}

export async function loadRadarWindow(limit = 8): Promise<RadarWindow> {
  const latest = await loadRadarSnapshot();
  let index: RadarIndex | null = null;
  try {
    index = await loadRadarIndex();
  } catch {
    return { latest, history: [latest], index: null };
  }

  const latestDate = dateKey(latest);
  const historicalDates = index.snapshots
    .map((item) => item.date)
    .filter((date) => date !== latestDate)
    .slice(0, Math.max(0, limit - 1));

  const settled = await Promise.allSettled(historicalDates.map((date) => loadRadarSnapshot(date)));
  const history = [
    latest,
    ...settled.flatMap((item) => item.status === 'fulfilled' ? [item.value] : []),
  ];

  history.sort((a, b) => (dateKey(b) ?? '').localeCompare(dateKey(a) ?? ''));
  return { latest, history, index };
}

export function historyMaturity(history: RadarSnapshot[]): HistoryMaturity {
  const dates = [...new Set(history.map(dateKey).filter((value): value is string => Boolean(value)))].sort().reverse();
  if (dates.length === 0) return { observedDays: 0, consecutiveDays: 0, requiredDays: 7, label: 'INSUFFICIENT_DATA' };

  let consecutiveDays = 1;
  let cursor = dates[0];
  const available = new Set(dates);
  while (available.has(subtractUtcDays(cursor, 1))) {
    cursor = subtractUtcDays(cursor, 1);
    consecutiveDays += 1;
  }

  const label = consecutiveDays >= 7
    ? 'MATURE_7D'
    : consecutiveDays >= 4
      ? 'BUILDING'
      : consecutiveDays >= 2
        ? 'EARLY'
        : 'INSUFFICIENT_DATA';

  return { observedDays: dates.length, consecutiveDays, requiredDays: 7, label };
}

export function rankWindowChange(
  current: RadarSnapshot,
  history: RadarSnapshot[],
  marketCode: string,
  appId: string,
  days: 1 | 3 | 7,
): RankWindowChange {
  const currentMarket = current.markets[marketCode];
  const currentEntry = currentMarket?.entries.find((entry) => entry.appId === appId);
  const currentRank = currentEntry?.rank ?? 0;
  const currentDate = dateKey(current);
  if (!currentDate || !currentEntry) {
    return { days, status: 'history_missing', delta: null, priorRank: null, currentRank };
  }

  const targetDate = subtractUtcDays(currentDate, days);
  const prior = history.find((snapshot) => dateKey(snapshot) === targetDate);
  if (!prior) return { days, status: 'history_missing', delta: null, priorRank: null, currentRank };

  const priorMarket = prior.markets[marketCode];
  if (!priorMarket || priorMarket.status !== 'ok') {
    return { days, status: 'market_failed', delta: null, priorRank: null, currentRank };
  }

  const priorEntry = priorMarket.entries.find((entry) => entry.appId === appId);
  if (!priorEntry) return { days, status: 'not_ranked', delta: null, priorRank: null, currentRank };

  return {
    days,
    status: 'available',
    delta: priorEntry.rank - currentEntry.rank,
    priorRank: priorEntry.rank,
    currentRank: currentEntry.rank,
  };
}

// Bounded rank-position heuristic from the frozen Radar V1 design.
// It describes position inside the observed chart only; it is not download share, revenue share, or probability.
export function rankVisibility(rank: number, depth: number) {
  if (!Number.isInteger(rank) || !Number.isInteger(depth) || depth < 1 || rank < 1 || rank > depth) return null;
  const value = Math.log((depth + 1) / rank) / Math.log(depth + 1);
  return Math.max(0, Math.min(1, value));
}

// Trend states are intentionally conservative. Rank evidence can support movement/persistence states,
// but CROWDED and WINDOW_CLOSING require mechanic-cluster saturation evidence and are never emitted here.
export function assessRadarTrend(
  current: RadarSnapshot,
  history: RadarSnapshot[],
  marketCode: string,
  appId: string,
): RadarTrendAssessment {
  const market = current.markets[marketCode];
  const entry = market?.entries.find((item) => item.appId === appId);
  if (!market || market.status !== 'ok' || market.gameFocused === false || !entry) {
    return {
      state: 'INSUFFICIENT_DATA',
      reason: 'A healthy Games-category observation is required before assigning a rank trend state.',
      evidenceDays: [],
    };
  }

  const oneDay = rankWindowChange(current, history, marketCode, appId, 1);
  const threeDay = rankWindowChange(current, history, marketCode, appId, 3);
  const sevenDay = rankWindowChange(current, history, marketCode, appId, 7);

  if (oneDay.status === 'not_ranked' && entry.rank <= 20) {
    return {
      state: 'EMERGING',
      reason: `Entered the tracked Games chart at #${entry.rank} after not ranking on the exact prior-day snapshot.`,
      evidenceDays: [1],
    };
  }

  if (sevenDay.status === 'available' && (sevenDay.delta ?? 0) <= -10) {
    return {
      state: 'DECLINING',
      reason: `Rank fell ${Math.abs(sevenDay.delta ?? 0)} places over the exact 7-day window.`,
      evidenceDays: [7],
    };
  }

  if (threeDay.status === 'available' && (threeDay.delta ?? 0) <= -5) {
    return {
      state: 'DECLINING',
      reason: `Rank fell ${Math.abs(threeDay.delta ?? 0)} places over the exact 3-day window.`,
      evidenceDays: [3],
    };
  }

  if (sevenDay.status === 'available' && (sevenDay.delta ?? 0) >= 10) {
    return {
      state: 'RISING',
      reason: `Rank improved ${sevenDay.delta} places over the exact 7-day window.`,
      evidenceDays: [7],
    };
  }

  if (threeDay.status === 'available' && (threeDay.delta ?? 0) >= 5) {
    return {
      state: 'RISING',
      reason: `Rank improved ${threeDay.delta} places over the exact 3-day window.`,
      evidenceDays: [3],
    };
  }

  if (oneDay.status === 'available' && (oneDay.delta ?? 0) >= 8) {
    return {
      state: 'RISING',
      reason: `Rank improved ${oneDay.delta} places on the exact prior-day comparison.`,
      evidenceDays: [1],
    };
  }

  if (entry.daysObserved >= 7 && sevenDay.status === 'available' && entry.rank <= 30) {
    return {
      state: 'ESTABLISHED',
      reason: `Observed for ${entry.daysObserved} daily snapshots, currently #${entry.rank}, with an exact 7-day comparison available.`,
      evidenceDays: [7],
    };
  }

  return {
    state: 'INSUFFICIENT_DATA',
    reason: 'Exact rank history does not yet meet the evidence gate for emerging, rising, established, or declining.',
    evidenceDays: [],
  };
}

export function fastestMovers(snapshot: RadarSnapshot, limit = 10) {
  return Object.values(snapshot.markets)
    .filter((market) => market.status === 'ok')
    .flatMap((market) => market.entries.map((entry) => ({ ...entry, market: market.label, country: market.country })))
    .filter((entry) => (entry.delta ?? 0) > 0)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
    .slice(0, limit);
}

export function newEntrants(snapshot: RadarSnapshot, limit = 10) {
  return Object.values(snapshot.markets)
    .filter((market) => market.status === 'ok')
    .flatMap((market) => market.entries.map((entry) => ({ ...entry, market: market.label, country: market.country })))
    .filter((entry) => entry.events.includes('NEW ENTRY'))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}

export function crossMarketLeaders(snapshot: RadarSnapshot, limit = 8) {
  const aggregate = new Map<string, {
    appId: string;
    name: string;
    publisher: string;
    iconUrl: string | null;
    storeUrl: string | null;
    marketCount: number;
    ranks: number[];
  }>();

  for (const market of Object.values(snapshot.markets)) {
    if (market.status !== 'ok' || market.gameFocused === false) continue;
    for (const entry of market.entries) {
      const current = aggregate.get(entry.appId) ?? {
        appId: entry.appId,
        name: entry.name,
        publisher: entry.publisher,
        iconUrl: entry.iconUrl,
        storeUrl: entry.storeUrl,
        marketCount: 0,
        ranks: [],
      };
      current.marketCount += 1;
      current.ranks.push(entry.rank);
      aggregate.set(entry.appId, current);
    }
  }

  return [...aggregate.values()]
    .map((item) => ({
      ...item,
      bestRank: Math.min(...item.ranks),
      averageRank: item.ranks.reduce((sum, rank) => sum + rank, 0) / item.ranks.length,
    }))
    .sort((a, b) => b.marketCount - a.marketCount || a.averageRank - b.averageRank)
    .slice(0, limit);
}
