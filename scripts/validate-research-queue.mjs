import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('public/data/research/latest.json');
const queue = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];
const allowedWindowStatuses = new Set(['available', 'history_missing', 'market_failed', 'not_ranked', 'source_mismatch']);

function assert(condition, message) {
  if (!condition) errors.push(message);
}

assert(queue.schemaVersion === 1, 'schemaVersion must be 1');
assert(typeof queue.generatedAt === 'string' && !Number.isNaN(Date.parse(queue.generatedAt)), 'generatedAt must be an ISO date');
assert(/^\d{4}-\d{2}-\d{2}$/.test(queue.radarDate ?? ''), 'radarDate must be YYYY-MM-DD');
assert(queue.method?.name === 'deterministic_research_priority_v1', 'unexpected queue method');
assert(queue.method?.statement?.includes('not an opportunity score'), 'method must explicitly disclaim opportunity scoring');
assert(Array.isArray(queue.limitations) && queue.limitations.some((value) => /not a download count/i.test(value)), 'rank/download limitation must be explicit');
assert(Array.isArray(queue.candidates), 'candidates must be an array');
assert(queue.candidates.length <= 12, 'candidate queue must stay capped at 12');

const ids = new Set();
let priorPriority = Number.POSITIVE_INFINITY;
for (let index = 0; index < (queue.candidates ?? []).length; index += 1) {
  const candidate = queue.candidates[index];
  assert(candidate.queueRank === index + 1, `candidate ${candidate.appId} queueRank is not contiguous`);
  assert(typeof candidate.appId === 'string' && candidate.appId.length >= 5, `candidate ${index + 1} has invalid appId`);
  assert(!ids.has(candidate.appId), `duplicate candidate ${candidate.appId}`);
  ids.add(candidate.appId);
  assert(Number.isInteger(candidate.researchPriority) && candidate.researchPriority >= 0 && candidate.researchPriority <= 100, `${candidate.appId} has invalid researchPriority`);
  assert(candidate.researchPriority <= priorPriority, `${candidate.appId} queue is not priority-sorted`);
  priorPriority = candidate.researchPriority;
  assert(candidate.priorityMeaning?.includes('not a success probability'), `${candidate.appId} priority meaning is unsafe/ambiguous`);
  assert(Array.isArray(candidate.reasonCodes) && candidate.reasonCodes.length > 0, `${candidate.appId} must have evidence reason codes`);
  assert(candidate.evidence?.sourceOrigin === 'official_public', `${candidate.appId} rank evidence must be official_public`);
  assert(candidate.evidence?.chartCategory === 'Games', `${candidate.appId} queue evidence must be Games chart evidence`);
  assert(Number.isInteger(candidate.evidence?.marketCount) && candidate.evidence.marketCount >= 1 && candidate.evidence.marketCount <= 4, `${candidate.appId} invalid marketCount`);
  assert(Number.isInteger(candidate.evidence?.bestRank) && candidate.evidence.bestRank >= 1 && candidate.evidence.bestRank <= 100, `${candidate.appId} invalid bestRank`);
  assert(Array.isArray(candidate.evidence?.markets) && candidate.evidence.markets.length === candidate.evidence.marketCount, `${candidate.appId} market evidence mismatch`);

  for (const key of ['1d', '3d', '7d']) {
    const window = candidate.evidence?.exactWindows?.[key];
    assert(window && allowedWindowStatuses.has(window.status), `${candidate.appId} ${key} has invalid exact-window status`);
    assert(Array.isArray(window?.perMarket) && window.perMarket.length === candidate.evidence.marketCount, `${candidate.appId} ${key} per-market evidence mismatch`);
    if (window?.status === 'available') {
      assert(Number.isInteger(window.bestUpwardDelta), `${candidate.appId} ${key} available window needs a bestUpwardDelta`);
      assert(window.perMarket.some((signal) => signal.status === 'available'), `${candidate.appId} ${key} summary says available without an available market`);
    } else {
      assert(window?.bestUpwardDelta == null, `${candidate.appId} ${key} non-available window cannot carry bestUpwardDelta`);
    }
    for (const signal of window?.perMarket ?? []) {
      assert(allowedWindowStatuses.has(signal.status), `${candidate.appId} ${key} ${signal.market} has invalid status`);
      if (signal.status === 'available') {
        assert(Number.isInteger(signal.priorRank) && Number.isInteger(signal.currentRank) && Number.isInteger(signal.delta), `${candidate.appId} ${key} ${signal.market} available signal must carry integer ranks/delta`);
        assert(signal.delta === signal.priorRank - signal.currentRank, `${candidate.appId} ${key} ${signal.market} delta mismatch`);
      } else {
        assert(signal.priorRank == null && signal.currentRank == null && signal.delta == null, `${candidate.appId} ${key} ${signal.market} non-comparable signal must not carry ranks/delta`);
      }
    }
  }

  const oneDayAvailable = candidate.evidence?.exactWindows?.['1d']?.status === 'available';
  const hasUpwardReason = candidate.reasonCodes.some((reason) => /^UP_\d+_PLUS_1D$/.test(reason));
  if (hasUpwardReason) assert(oneDayAvailable, `${candidate.appId} has 1d movement priority without comparable 1d evidence`);

  assert(candidate.appleMetadata == null || candidate.appleMetadata.sourceOrigin === 'official_public', `${candidate.appId} Apple metadata provenance missing`);
  if (candidate.appBrainEstimate != null) {
    assert(candidate.appBrainEstimate.sourceOrigin === 'third_party_estimate', `${candidate.appId} AppBrain data must be labeled third_party_estimate`);
    assert(candidate.appBrainEstimate.provider === 'AppBrain', `${candidate.appId} AppBrain provider label missing`);
  }
  if (candidate.analysisEvidence != null) {
    const pack = candidate.analysisEvidence;
    assert(pack.source === 'live_analyze_game', `${candidate.appId} evidence pack has wrong source`);
    assert(pack.sourceOrigin === 'official_public', `${candidate.appId} evidence pack must remain official_public`);
    assert(typeof pack.observedAt === 'string' && !Number.isNaN(Date.parse(pack.observedAt)), `${candidate.appId} evidence pack observedAt invalid`);
    assert(Number.isInteger(pack.findingCount) && pack.findingCount >= 5, `${candidate.appId} evidence pack has too few findings`);
    assert(Number.isInteger(pack.unknownCount) && pack.unknownCount >= 5, `${candidate.appId} evidence pack must preserve explicit unknowns`);
    assert(Array.isArray(pack.findings) && pack.findings.length === pack.findingCount, `${candidate.appId} evidence pack finding count mismatch`);
    assert(Array.isArray(pack.unknowns) && pack.unknowns.length === pack.unknownCount, `${candidate.appId} evidence pack unknown count mismatch`);
    assert(pack.findings.every((finding) => typeof finding.evidenceLabel === 'string' && finding.evidenceLabel.length >= 10), `${candidate.appId} evidence pack contains finding without evidence label`);
    assert(!/downloads? estimated from rank|revenue estimated from rank|percent of players/i.test(JSON.stringify(pack)), `${candidate.appId} evidence pack contains forbidden performance/population claim`);
  }
}

const appBrain = queue.sources?.appBrain;
assert(['unconfigured', 'complete', 'partial', 'failed'].includes(appBrain?.status), 'invalid AppBrain source status');
assert(Number.isInteger(appBrain?.dailyCreditCap) && appBrain.dailyCreditCap >= 0 && appBrain.dailyCreditCap <= 10, 'AppBrain daily cap must be 0..10');
assert(Number.isInteger(appBrain?.creditsUsedThisRun) && appBrain.creditsUsedThisRun >= 0 && appBrain.creditsUsedThisRun <= appBrain.dailyCreditCap, 'AppBrain credits exceed daily cap');
if (appBrain?.status === 'unconfigured') {
  assert((queue.candidates ?? []).every((candidate) => candidate.appBrainEstimate == null), 'unconfigured AppBrain must not produce estimate rows');
}

assert(['complete', 'partial'].includes(queue.sources?.appleCharts?.status), 'Apple chart source must be complete or partial');
assert(['complete', 'partial', 'failed'].includes(queue.sources?.appleLookup?.status), 'invalid Apple lookup status');
const liveAnalyzer = queue.sources?.liveAnalyzer;
if (liveAnalyzer != null) {
  assert(['disabled', 'complete', 'partial', 'failed'].includes(liveAnalyzer.status), 'invalid liveAnalyzer source status');
  assert(Number.isInteger(liveAnalyzer.cap) && liveAnalyzer.cap >= 0 && liveAnalyzer.cap <= 8, 'liveAnalyzer cap must be 0..8');
  assert(Number.isInteger(liveAnalyzer.attempted) && liveAnalyzer.attempted >= 0 && liveAnalyzer.attempted <= liveAnalyzer.cap, 'liveAnalyzer attempted count invalid');
  assert(Number.isInteger(liveAnalyzer.succeeded) && liveAnalyzer.succeeded >= 0 && liveAnalyzer.succeeded <= liveAnalyzer.attempted, 'liveAnalyzer succeeded count invalid');
  const packCount = (queue.candidates ?? []).filter((candidate) => candidate.analysisEvidence != null).length;
  assert(packCount === liveAnalyzer.succeeded, 'liveAnalyzer succeeded count must equal persisted evidence packs');
}

if (errors.length) {
  console.error('[research-queue] validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[research-queue] validation PASS · ${queue.candidates.length} candidates · AppBrain ${appBrain.status} · ${appBrain.creditsUsedThisRun}/${appBrain.dailyCreditCap} credits · evidence packs ${liveAnalyzer?.succeeded ?? 0}/${liveAnalyzer?.attempted ?? 0}`);
