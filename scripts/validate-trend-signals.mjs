import fs from 'node:fs';
import path from 'node:path';

const radar = JSON.parse(fs.readFileSync(path.resolve('public/data/radar/latest.json'), 'utf8'));
const signals = JSON.parse(fs.readFileSync(path.resolve('public/data/radar/trend-signals.json'), 'utf8'));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

const allowedStates = new Set(['EMERGING', 'RISING', 'ESTABLISHED', 'DECLINING', 'INSUFFICIENT_DATA']);
const allowedWindowStates = new Set(['available', 'history_missing', 'not_ranked', 'market_failed', 'source_mismatch', 'coverage_gap']);

assert(signals.schemaVersion === 1, 'schemaVersion must be 1');
assert(signals.radarGeneratedAt === radar.generatedAt, 'trend signals must derive from the current Radar snapshot');
assert(signals.radarDate === String(radar.generatedAt).slice(0, 10), 'radarDate mismatch');
assert(signals.chart === 'top-free' && signals.category === 'Games', 'unexpected chart/category');
assert(Number.isInteger(signals.chartDepth) && signals.chartDepth >= 10 && signals.chartDepth <= 100, 'invalid chartDepth');
assert(signals.chartDepth === radar.chartDepth, 'trend chartDepth must match Radar chartDepth');
assert(signals.method?.name === 'exact_rank_trend_signals_v1', 'unexpected trend method');
assert(signals.method?.visibilityFormula === 'ln((N+1)/rank)/ln(N+1)', 'visibility formula changed');
assert(/3-day/i.test(signals.method?.directionalStateRule ?? ''), 'directional state rule must require exact 3-day evidence');
assert(/one-day movement/i.test(signals.method?.directionalStateRule ?? ''), 'directional state rule must separate 1-day movement facts');
assert(/not download share/i.test(signals.statement), 'statement must reject download-share interpretation');
assert(/not.*build recommendation/i.test(signals.statement), 'statement must reject build recommendation');
assert(!signals.method?.statesEmitted?.includes('CROWDED'), 'CROWDED cannot be emitted from rank evidence alone');
assert(!signals.method?.statesEmitted?.includes('WINDOW_CLOSING'), 'WINDOW_CLOSING cannot be emitted from rank evidence alone');
assert(/coverage_gap/i.test(signals.method?.missingHistoryRule ?? ''), 'missing-history rule must document shallow-chart coverage gaps');

let signalCount = 0;
const stateCounts = {};
for (const [marketCode, market] of Object.entries(signals.markets ?? {})) {
  const radarMarket = radar.markets?.[marketCode];
  assert(Boolean(radarMarket), `signal market ${marketCode} missing from Radar source`);
  assert(Array.isArray(market.signals), `${marketCode} signals must be an array`);

  if (market.status === 'ok' && market.gameFocused === true) {
    assert(radarMarket?.status === 'ok' && radarMarket?.gameFocused === true, `${marketCode} is not a healthy Games market in Radar source`);
    assert(market.signals.length === radarMarket.entries.length, `${marketCode} signal count does not match Radar entries`);
  } else {
    assert(market.signals.length === 0, `${marketCode} non-Games/failed market must not emit trend signals`);
  }

  for (let index = 0; index < market.signals.length; index += 1) {
    const signal = market.signals[index];
    const source = radarMarket.entries[index];
    assert(signal.appId === String(source.appId), `${marketCode} #${index + 1} appId mismatch`);
    assert(signal.rank === source.rank, `${marketCode} ${signal.appId} rank mismatch`);
    assert(signal.iconUrl == null || typeof signal.iconUrl === 'string', `${marketCode} ${signal.appId} iconUrl invalid`);
    assert(signal.storeUrl == null || typeof signal.storeUrl === 'string', `${marketCode} ${signal.appId} storeUrl invalid`);
    assert(signal.chartDepth === signals.chartDepth, `${marketCode} ${signal.appId} chartDepth mismatch`);
    assert(typeof signal.visibility === 'number' && signal.visibility >= 0 && signal.visibility <= 1, `${marketCode} ${signal.appId} visibility out of bounds`);
    const expectedVisibility = Math.log((signals.chartDepth + 1) / signal.rank) / Math.log(signals.chartDepth + 1);
    assert(Math.abs(signal.visibility - expectedVisibility) < 1e-12, `${marketCode} ${signal.appId} visibility formula mismatch`);
    assert(allowedStates.has(signal.trend?.state), `${marketCode} ${signal.appId} invalid trend state`);
    assert(typeof signal.trend?.reason === 'string' && signal.trend.reason.length >= 20, `${marketCode} ${signal.appId} missing trend rationale`);
    assert(Array.isArray(signal.trend?.evidenceDays), `${marketCode} ${signal.appId} evidenceDays missing`);

    for (const key of ['1d', '3d', '7d']) {
      const window = signal.exactWindows?.[key];
      assert(Boolean(window), `${marketCode} ${signal.appId} missing ${key} window`);
      assert(allowedWindowStates.has(window?.status), `${marketCode} ${signal.appId} invalid ${key} status`);
      if (window?.status !== 'available') {
        assert(window?.delta == null && window?.priorRank == null && window?.currentRank == null, `${marketCode} ${signal.appId} ${key} cannot carry rank values for ${window?.status}`);
      } else {
        assert(Number.isInteger(window?.priorRank) && Number.isInteger(window?.currentRank), `${marketCode} ${signal.appId} ${key} available window requires ranks`);
        assert(window.delta === window.priorRank - window.currentRank, `${marketCode} ${signal.appId} ${key} delta mismatch`);
      }
    }

    if (signal.trend.state === 'INSUFFICIENT_DATA') {
      assert(signal.trend.evidenceDays.length === 0, `${marketCode} ${signal.appId} insufficient state cannot cite a qualifying trend window`);
    }
    if (signal.trend.state === 'EMERGING') {
      assert(signal.exactWindows['3d'].status === 'not_ranked' && signal.rank <= 20, `${marketCode} ${signal.appId} emerging gate must use exact 3-day absence`);
      assert(signal.trend.evidenceDays.length === 1 && signal.trend.evidenceDays[0] === 3, `${marketCode} ${signal.appId} emerging must cite 3d evidence`);
    }
    if (signal.trend.state === 'RISING') {
      assert(signal.exactWindows['3d'].status === 'available' && signal.exactWindows['3d'].delta >= 5, `${marketCode} ${signal.appId} RISING must use +5 or better exact 3-day movement`);
      assert(signal.trend.evidenceDays.length === 1 && signal.trend.evidenceDays[0] === 3, `${marketCode} ${signal.appId} RISING must cite 3d evidence`);
    }
    if (signal.trend.state === 'DECLINING') {
      assert(signal.exactWindows['3d'].status === 'available' && signal.exactWindows['3d'].delta <= -5, `${marketCode} ${signal.appId} DECLINING must use -5 or worse exact 3-day movement`);
      assert(signal.trend.evidenceDays.length === 1 && signal.trend.evidenceDays[0] === 3, `${marketCode} ${signal.appId} DECLINING must cite 3d evidence`);
    }
    if (signal.trend.state === 'ESTABLISHED') {
      assert(signal.daysObserved >= 7 && signal.rank <= 30, `${marketCode} ${signal.appId} established persistence gate invalid`);
      assert(signal.exactWindows['3d'].status === 'available' && signal.exactWindows['7d'].status === 'available', `${marketCode} ${signal.appId} established requires exact 3d and 7d windows`);
      assert(Math.abs(signal.exactWindows['3d'].delta) < 5 && Math.abs(signal.exactWindows['7d'].delta) < 8, `${marketCode} ${signal.appId} established movement is too directional`);
    }
    if (Object.values(signal.exactWindows).some((window) => window.status === 'coverage_gap')) {
      assert(signal.trend.state !== 'EMERGING', `${marketCode} ${signal.appId} coverage gap cannot be treated as emerging`);
    }

    signalCount += 1;
    stateCounts[signal.trend.state] = (stateCounts[signal.trend.state] ?? 0) + 1;
  }
}

assert(signals.summary?.signalCount === signalCount, 'summary signalCount mismatch');
assert(signals.summary?.healthyGameMarkets === Object.values(signals.markets ?? {}).filter((market) => market.status === 'ok' && market.gameFocused === true).length, 'summary healthyGameMarkets mismatch');
for (const [state, count] of Object.entries(stateCounts)) {
  assert(signals.summary?.stateCounts?.[state] === count, `summary state count mismatch for ${state}`);
}

if (errors.length) {
  console.error('[trend-signals] validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[trend-signals] validation PASS · ${signalCount} exact chart signal(s) · conservative 3d state gates · ${JSON.stringify(stateCounts)}`);
