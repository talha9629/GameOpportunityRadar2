import fs from 'node:fs';
import path from 'node:path';

const signalsPath = path.resolve('public/data/radar/trend-signals.json');
const outputPath = path.resolve('public/data/radar/trend-attention.json');

const signals = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
const groups = new Map();

for (const market of Object.values(signals.markets ?? {})) {
  if (market?.status !== 'ok' || market?.gameFocused !== true || !Array.isArray(market.signals)) continue;
  for (const signal of market.signals) {
    if (signal?.trend?.state === 'INSUFFICIENT_DATA') continue;
    const appId = String(signal.appId);
    const group = groups.get(appId) ?? {
      appId,
      name: signal.name,
      publisher: signal.publisher,
      evidence: [],
    };
    const evidenceDays = Array.isArray(signal.trend.evidenceDays) ? signal.trend.evidenceDays : [];
    const evidenceDay = evidenceDays[0] ?? null;
    const window = evidenceDay ? signal.exactWindows?.[`${evidenceDay}d`] ?? null : null;
    group.evidence.push({
      country: market.country,
      market: market.label,
      state: signal.trend.state,
      rank: signal.rank,
      visibility: signal.visibility,
      daysObserved: signal.daysObserved,
      reason: signal.trend.reason,
      evidenceDay,
      window,
    });
    groups.set(appId, group);
  }
}

function countState(evidence, state) {
  return evidence.filter((item) => item.state === state).length;
}

function attentionClass(item) {
  const rising = countState(item.evidence, 'RISING');
  const emerging = countState(item.evidence, 'EMERGING');
  const declining = countState(item.evidence, 'DECLINING');
  const established = countState(item.evidence, 'ESTABLISHED');
  const movementMarkets = rising + emerging + declining;

  if (movementMarkets >= 2) return 'CROSS_MARKET_MOVEMENT';
  if (movementMarkets === 1) return 'SINGLE_MARKET_MOVEMENT';
  if (established >= 2) return 'CROSS_MARKET_ESTABLISHED';
  return 'SINGLE_MARKET_ESTABLISHED';
}

const items = [...groups.values()].map((item) => {
  item.evidence.sort((a, b) => a.country.localeCompare(b.country));
  const counts = {
    EMERGING: countState(item.evidence, 'EMERGING'),
    RISING: countState(item.evidence, 'RISING'),
    ESTABLISHED: countState(item.evidence, 'ESTABLISHED'),
    DECLINING: countState(item.evidence, 'DECLINING'),
  };
  const bestRank = Math.min(...item.evidence.map((entry) => entry.rank));
  const maxVisibility = Math.max(...item.evidence.map((entry) => entry.visibility));
  const movingMarketCount = counts.EMERGING + counts.RISING + counts.DECLINING;
  return {
    ...item,
    evidenceMarketCount: item.evidence.length,
    movingMarketCount,
    bestRank,
    maxVisibility,
    counts,
    attentionClass: attentionClass(item),
    reasonCodes: [
      counts.RISING >= 2 ? `RISING_${counts.RISING}_MARKETS` : counts.RISING === 1 ? 'RISING_1_MARKET' : null,
      counts.EMERGING >= 2 ? `EMERGING_${counts.EMERGING}_MARKETS` : counts.EMERGING === 1 ? 'EMERGING_1_MARKET' : null,
      counts.DECLINING >= 2 ? `DECLINING_${counts.DECLINING}_MARKETS` : counts.DECLINING === 1 ? 'DECLINING_1_MARKET' : null,
      counts.ESTABLISHED >= 2 ? `ESTABLISHED_${counts.ESTABLISHED}_MARKETS` : counts.ESTABLISHED === 1 ? 'ESTABLISHED_1_MARKET' : null,
    ].filter(Boolean),
  };
});

items.sort((a, b) =>
  b.movingMarketCount - a.movingMarketCount
  || b.evidenceMarketCount - a.evidenceMarketCount
  || b.counts.RISING - a.counts.RISING
  || b.counts.EMERGING - a.counts.EMERGING
  || a.bestRank - b.bestRank
  || b.maxVisibility - a.maxVisibility
  || a.appId.localeCompare(b.appId),
);

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  trendGeneratedAt: signals.generatedAt,
  radarGeneratedAt: signals.radarGeneratedAt,
  radarDate: signals.radarDate,
  statement: 'Trend Attention groups only already-qualified exact-date trend evidence across markets. Ordering is deterministic factual triage, not a success prediction, opportunity score, market-size estimate, or build recommendation.',
  method: {
    name: 'cross_market_trend_attention_v1',
    source: 'exact_rank_trend_signals_v1',
    excludedState: 'INSUFFICIENT_DATA',
    ordering: [
      'number of markets with factual movement',
      'number of markets with any qualified trend state',
      'number of RISING markets',
      'number of EMERGING markets',
      'best observed rank',
      'maximum bounded chart visibility',
      'stable app id',
    ],
    prohibitedClaims: [
      'No downloads or revenue inferred from rank.',
      'No success probability or predicted winner.',
      'No CROWDED or WINDOW_CLOSING state from rank evidence.',
      'No causal claim about why rank moved.',
    ],
  },
  summary: {
    appCount: items.length,
    evidenceCount: items.reduce((sum, item) => sum + item.evidenceMarketCount, 0),
    crossMarketMovementCount: items.filter((item) => item.attentionClass === 'CROSS_MARKET_MOVEMENT').length,
    singleMarketMovementCount: items.filter((item) => item.attentionClass === 'SINGLE_MARKET_MOVEMENT').length,
    establishedOnlyCount: items.filter((item) => item.movingMarketCount === 0).length,
  },
  items,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`[trend-attention] ${output.summary.appCount} app(s) · ${output.summary.evidenceCount} qualified market signal(s) · ${output.summary.crossMarketMovementCount} cross-market movement app(s)`);
