import fs from 'node:fs';
import path from 'node:path';

const researchRoot = path.resolve('public/data/research');
const latestPath = path.join(researchRoot, 'latest.json');
const digestPath = path.join(researchRoot, 'digest.json');
const digestHistoryRoot = path.join(researchRoot, 'digest-history');

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function subtractUtcDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function lifecycle(candidate) {
  const threeDay = candidate?.evidence?.exactWindows?.['3d'];
  if (threeDay?.status === 'available' && threeDay.bestUpwardDelta != null) {
    if (threeDay.bestUpwardDelta > 0) return { state: 'RISING_EXACT_3D', evidence: `Best exact 3d rank improvement is +${threeDay.bestUpwardDelta}.` };
    if (threeDay.bestUpwardDelta < 0) return { state: 'FALLING_EXACT_3D', evidence: `Best exact 3d rank change is ${threeDay.bestUpwardDelta}.` };
    return { state: 'FLAT_EXACT_3D', evidence: 'Best exact 3d rank change is 0.' };
  }
  if ((candidate?.evidence?.maxObservedDays ?? 0) >= 7) return { state: 'PERSISTING_7D', evidence: `Observed on tracked chart for ${candidate.evidence.maxObservedDays} day(s).` };
  if ((candidate?.evidence?.maxObservedDays ?? 0) >= 3) return { state: 'PERSISTING_3D', evidence: `Observed on tracked chart for ${candidate.evidence.maxObservedDays} day(s).` };
  return { state: 'INSUFFICIENT_HISTORY', evidence: `Only ${candidate?.evidence?.maxObservedDays ?? 0} observed day(s); no 3-day direction is claimed.` };
}

const current = readJson(latestPath);
if (!current?.radarDate || !Array.isArray(current?.candidates)) throw new Error('A valid research queue is required before digest generation.');
const comparisonDate = subtractUtcDays(current.radarDate, 1);
const previous = readJson(path.join(researchRoot, 'history', `${comparisonDate}.json`));
const changes = [];

if (previous?.radarDate === comparisonDate && Array.isArray(previous?.candidates)) {
  const previousById = new Map(previous.candidates.map((candidate) => [String(candidate.appId), candidate]));
  const currentById = new Map(current.candidates.map((candidate) => [String(candidate.appId), candidate]));

  for (const candidate of current.candidates) {
    const prior = previousById.get(String(candidate.appId));
    if (!prior) {
      changes.push({
        type: 'NEW_TO_RESEARCH_QUEUE',
        appId: candidate.appId,
        name: candidate.name,
        significance: 'attention',
        evidence: [`Not present in the exact ${comparisonDate} queue.`, `Current priority ${candidate.researchPriority}.`, `Current best Games rank #${candidate.evidence.bestRank} across ${candidate.evidence.marketCount} market(s).`],
      });
      continue;
    }

    const priorityDelta = candidate.researchPriority - prior.researchPriority;
    if (Math.abs(priorityDelta) >= 10) {
      changes.push({
        type: priorityDelta > 0 ? 'PRIORITY_INCREASED' : 'PRIORITY_DECREASED',
        appId: candidate.appId,
        name: candidate.name,
        significance: 'attention',
        previous: prior.researchPriority,
        current: candidate.researchPriority,
        delta: priorityDelta,
        evidence: [`Research priority changed ${prior.researchPriority} → ${candidate.researchPriority}.`, 'Priority is deterministic triage from Apple rank evidence, not a success probability.'],
      });
    }

    const marketDelta = candidate.evidence.marketCount - prior.evidence.marketCount;
    if (marketDelta !== 0) {
      changes.push({
        type: marketDelta > 0 ? 'CROSS_MARKET_EXPANDED' : 'CROSS_MARKET_CONTRACTED',
        appId: candidate.appId,
        name: candidate.name,
        significance: 'attention',
        previous: prior.evidence.marketCount,
        current: candidate.evidence.marketCount,
        delta: marketDelta,
        evidence: [`Healthy Games-chart market presence changed ${prior.evidence.marketCount} → ${candidate.evidence.marketCount}.`],
      });
    }

    const rankDelta = prior.evidence.bestRank - candidate.evidence.bestRank;
    if (Math.abs(rankDelta) >= 5) {
      changes.push({
        type: rankDelta > 0 ? 'BEST_RANK_IMPROVED' : 'BEST_RANK_DECLINED',
        appId: candidate.appId,
        name: candidate.name,
        significance: 'info',
        previous: prior.evidence.bestRank,
        current: candidate.evidence.bestRank,
        delta: rankDelta,
        evidence: [`Best observed current Games rank changed #${prior.evidence.bestRank} → #${candidate.evidence.bestRank}.`],
      });
    }

    for (const days of [3, 7]) {
      const key = `${days}d`;
      const priorStatus = prior.evidence?.exactWindows?.[key]?.status;
      const currentSignal = candidate.evidence?.exactWindows?.[key];
      if (priorStatus !== 'available' && currentSignal?.status === 'available') {
        changes.push({
          type: `EXACT_${days}D_HISTORY_MATURED`,
          appId: candidate.appId,
          name: candidate.name,
          significance: 'attention',
          evidence: [`Exact ${days}-day comparison is now available.`, `Best upward delta: ${currentSignal.bestUpwardDelta ?? 'unknown'}.`],
        });
      }
    }
  }

  for (const candidate of previous.candidates) {
    if (!currentById.has(String(candidate.appId))) {
      changes.push({
        type: 'DROPPED_FROM_RESEARCH_QUEUE',
        appId: candidate.appId,
        name: candidate.name,
        significance: 'attention',
        evidence: [`Present in the exact ${comparisonDate} queue but absent from the current queue.`, 'This does not mean the game failed; it only means it no longer meets the current deterministic triage cutoff.'],
      });
    }
  }
}

const states = current.candidates.map((candidate) => ({
  appId: candidate.appId,
  name: candidate.name,
  queueRank: candidate.queueRank,
  researchPriority: candidate.researchPriority,
  ...lifecycle(candidate),
}));

const digest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  currentDate: current.radarDate,
  comparisonDate,
  status: previous?.radarDate === comparisonDate ? 'complete' : 'history_pending',
  statement: 'This digest reports exact observed changes between dated research queues. It does not predict success, downloads, revenue, or causal demand.',
  summary: {
    currentCandidateCount: current.candidates.length,
    changeCount: changes.length,
    attentionCount: changes.filter((change) => change.significance === 'attention').length,
    newCandidates: changes.filter((change) => change.type === 'NEW_TO_RESEARCH_QUEUE').length,
    droppedCandidates: changes.filter((change) => change.type === 'DROPPED_FROM_RESEARCH_QUEUE').length,
    marketChanges: changes.filter((change) => change.type.startsWith('CROSS_MARKET_')).length,
    maturityEvents: changes.filter((change) => /^EXACT_[37]D_HISTORY_MATURED$/.test(change.type)).length,
  },
  limitations: [
    'No previous exact-date queue means history_pending, not zero change.',
    'Priority changes reflect deterministic triage inputs, not changes in probability of commercial success.',
    'Dropped-from-queue is a triage state only and is not a claim about installs, revenue, retention or product quality.',
    'RISING/FALLING lifecycle states are only emitted when an exact 3-day rank comparison exists.',
  ],
  changes,
  states,
};

fs.mkdirSync(digestHistoryRoot, { recursive: true });
fs.writeFileSync(digestPath, `${JSON.stringify(digest, null, 2)}\n`);
fs.writeFileSync(path.join(digestHistoryRoot, `${current.radarDate}.json`), `${JSON.stringify(digest, null, 2)}\n`);
console.log(`[research-digest] ${digest.status} · ${digest.summary.changeCount} changes · ${digest.summary.attentionCount} attention · ${states.length} states`);
