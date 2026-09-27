import fs from 'node:fs';
import path from 'node:path';

const trends = JSON.parse(fs.readFileSync(path.resolve('public/data/radar/trend-signals.json'), 'utf8'));
const attention = JSON.parse(fs.readFileSync(path.resolve('public/data/radar/trend-attention.json'), 'utf8'));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

const allowedStates = new Set(['EMERGING', 'RISING', 'ESTABLISHED', 'DECLINING']);
const allowedClasses = new Set(['CROSS_MARKET_MOVEMENT', 'SINGLE_MARKET_MOVEMENT', 'CROSS_MARKET_ESTABLISHED', 'SINGLE_MARKET_ESTABLISHED']);

assert(attention.schemaVersion === 1, 'schemaVersion must be 1');
assert(attention.trendGeneratedAt === trends.generatedAt, 'attention must derive from current trend artifact');
assert(attention.radarGeneratedAt === trends.radarGeneratedAt, 'attention Radar provenance mismatch');
assert(attention.radarDate === trends.radarDate, 'attention radarDate mismatch');
assert(attention.method?.name === 'cross_market_trend_attention_v1', 'unexpected attention method');
assert(attention.method?.source === 'exact_rank_trend_signals_v1', 'unexpected attention source');
assert(attention.method?.excludedState === 'INSUFFICIENT_DATA', 'attention must exclude insufficient data');
assert(/not a success prediction/i.test(attention.statement), 'attention statement must reject success prediction');
assert(/not.*build recommendation/i.test(attention.statement), 'attention statement must reject build recommendation');
assert(!/CROWDED|WINDOW_CLOSING/.test(JSON.stringify(attention.items ?? [])), 'attention items cannot emit saturation states');

const sourceByKey = new Map();
for (const market of Object.values(trends.markets ?? {})) {
  if (market?.status !== 'ok' || market?.gameFocused !== true) continue;
  for (const signal of market.signals ?? []) {
    if (signal?.trend?.state === 'INSUFFICIENT_DATA') continue;
    sourceByKey.set(`${signal.appId}\u0000${market.country}`, { signal, market });
  }
}

const seenApps = new Set();
let evidenceCount = 0;
let crossMarketMovementCount = 0;
let singleMarketMovementCount = 0;
let establishedOnlyCount = 0;
let prior = null;

for (const item of attention.items ?? []) {
  assert(!seenApps.has(item.appId), `duplicate attention app ${item.appId}`);
  seenApps.add(item.appId);
  assert(Array.isArray(item.evidence) && item.evidence.length > 0, `${item.appId} has no evidence`);
  assert(item.evidenceMarketCount === item.evidence.length, `${item.appId} evidenceMarketCount mismatch`);
  assert(allowedClasses.has(item.attentionClass), `${item.appId} invalid attentionClass`);
  assert(Array.isArray(item.reasonCodes), `${item.appId} reasonCodes missing`);

  const states = { EMERGING: 0, RISING: 0, ESTABLISHED: 0, DECLINING: 0 };
  let bestRank = Infinity;
  let maxVisibility = -Infinity;
  const countries = new Set();

  for (const evidence of item.evidence) {
    assert(!countries.has(evidence.country), `${item.appId} duplicates market ${evidence.country}`);
    countries.add(evidence.country);
    assert(allowedStates.has(evidence.state), `${item.appId} has invalid state ${evidence.state}`);
    const source = sourceByKey.get(`${item.appId}\u0000${evidence.country}`);
    assert(Boolean(source), `${item.appId} ${evidence.country} is not traceable to current trend signals`);
    if (source) {
      assert(source.signal.trend.state === evidence.state, `${item.appId} ${evidence.country} state mismatch`);
      assert(source.signal.rank === evidence.rank, `${item.appId} ${evidence.country} rank mismatch`);
      assert(Math.abs(source.signal.visibility - evidence.visibility) < 1e-12, `${item.appId} ${evidence.country} visibility mismatch`);
      assert(source.signal.trend.reason === evidence.reason, `${item.appId} ${evidence.country} reason mismatch`);
      const sourceDay = source.signal.trend.evidenceDays?.[0] ?? null;
      assert(sourceDay === evidence.evidenceDay, `${item.appId} ${evidence.country} evidence day mismatch`);
      if (evidence.evidenceDay) {
        const sourceWindow = source.signal.exactWindows?.[`${evidence.evidenceDay}d`] ?? null;
        assert(JSON.stringify(sourceWindow) === JSON.stringify(evidence.window), `${item.appId} ${evidence.country} exact window mismatch`);
      }
    }
    states[evidence.state] += 1;
    bestRank = Math.min(bestRank, evidence.rank);
    maxVisibility = Math.max(maxVisibility, evidence.visibility);
    evidenceCount += 1;
  }

  assert(item.bestRank === bestRank, `${item.appId} bestRank mismatch`);
  assert(Math.abs(item.maxVisibility - maxVisibility) < 1e-12, `${item.appId} maxVisibility mismatch`);
  for (const [state, count] of Object.entries(states)) assert(item.counts?.[state] === count, `${item.appId} ${state} count mismatch`);
  const movingMarketCount = states.EMERGING + states.RISING + states.DECLINING;
  assert(item.movingMarketCount === movingMarketCount, `${item.appId} movingMarketCount mismatch`);

  const expectedClass = movingMarketCount >= 2
    ? 'CROSS_MARKET_MOVEMENT'
    : movingMarketCount === 1
      ? 'SINGLE_MARKET_MOVEMENT'
      : states.ESTABLISHED >= 2
        ? 'CROSS_MARKET_ESTABLISHED'
        : 'SINGLE_MARKET_ESTABLISHED';
  assert(item.attentionClass === expectedClass, `${item.appId} attentionClass mismatch`);

  if (item.attentionClass === 'CROSS_MARKET_MOVEMENT') crossMarketMovementCount += 1;
  if (item.attentionClass === 'SINGLE_MARKET_MOVEMENT') singleMarketMovementCount += 1;
  if (movingMarketCount === 0) establishedOnlyCount += 1;

  if (prior) {
    const ordered = prior.movingMarketCount > item.movingMarketCount
      || (prior.movingMarketCount === item.movingMarketCount && prior.evidenceMarketCount > item.evidenceMarketCount)
      || (prior.movingMarketCount === item.movingMarketCount && prior.evidenceMarketCount === item.evidenceMarketCount && prior.counts.RISING > item.counts.RISING)
      || (prior.movingMarketCount === item.movingMarketCount && prior.evidenceMarketCount === item.evidenceMarketCount && prior.counts.RISING === item.counts.RISING && prior.counts.EMERGING > item.counts.EMERGING)
      || (prior.movingMarketCount === item.movingMarketCount && prior.evidenceMarketCount === item.evidenceMarketCount && prior.counts.RISING === item.counts.RISING && prior.counts.EMERGING === item.counts.EMERGING && prior.bestRank < item.bestRank)
      || (prior.movingMarketCount === item.movingMarketCount && prior.evidenceMarketCount === item.evidenceMarketCount && prior.counts.RISING === item.counts.RISING && prior.counts.EMERGING === item.counts.EMERGING && prior.bestRank === item.bestRank && (prior.maxVisibility > item.maxVisibility || (prior.maxVisibility === item.maxVisibility && prior.appId <= item.appId)));
    assert(ordered, `attention ordering violated between ${prior.appId} and ${item.appId}`);
  }
  prior = item;
}

assert(attention.summary?.appCount === (attention.items?.length ?? 0), 'summary appCount mismatch');
assert(attention.summary?.evidenceCount === evidenceCount, 'summary evidenceCount mismatch');
assert(attention.summary?.crossMarketMovementCount === crossMarketMovementCount, 'summary crossMarketMovementCount mismatch');
assert(attention.summary?.singleMarketMovementCount === singleMarketMovementCount, 'summary singleMarketMovementCount mismatch');
assert(attention.summary?.establishedOnlyCount === establishedOnlyCount, 'summary establishedOnlyCount mismatch');
assert(evidenceCount === sourceByKey.size, `attention covers ${evidenceCount}/${sourceByKey.size} qualified source signals`);

if (errors.length) {
  console.error('[trend-attention] validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`[trend-attention] validation PASS · ${attention.summary.appCount} app(s) · ${evidenceCount} qualified market signal(s) · ${crossMarketMovementCount} cross-market movement`);
