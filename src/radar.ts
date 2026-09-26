export interface RadarEntry {
  rank: number;
  priorRank: number | null;
  delta: number | null;
  appId: string;
  name: string;
  publisher: string;
  iconUrl: string | null;
  storeUrl: string | null;
  firstObserved: string;
  daysObserved: number;
  bestObservedRank: number;
  events: string[];
}

export interface RadarMarket {
  country: string;
  label: string;
  status: 'ok' | 'failed';
  sourceMode?: string;
  sourceUrl?: string;
  gameFocused?: boolean;
  warning?: string | null;
  error?: string;
  entries: RadarEntry[];
}

export interface RadarSnapshot {
  schemaVersion: number;
  generatedAt: string | null;
  chart: string;
  category: string;
  markets: Record<string, RadarMarket>;
}

export async function loadRadarSnapshot(): Promise<RadarSnapshot> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/radar/latest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Radar snapshot request failed (${response.status}).`);
  return response.json() as Promise<RadarSnapshot>;
}

export function fastestMovers(snapshot: RadarSnapshot, limit = 10) {
  return Object.values(snapshot.markets)
    .flatMap((market) => market.entries.map((entry) => ({ ...entry, market: market.label, country: market.country })))
    .filter((entry) => (entry.delta ?? 0) > 0)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
    .slice(0, limit);
}

export function newEntrants(snapshot: RadarSnapshot, limit = 10) {
  return Object.values(snapshot.markets)
    .flatMap((market) => market.entries.map((entry) => ({ ...entry, market: market.label, country: market.country })))
    .filter((entry) => entry.events.includes('NEW ENTRY'))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}
