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
  if ((candidate?.evidence?.maxObservedDays ?? 0) >= 7) return { state: 'PERSISTING_7D', evidence: `Observed on tracked chart for ${candidate.evidence.maxObservedDays} consecutive day(s).` };
  if ((candidate?.evidence?.maxObservedDays ?? 0) >= 3) return { state: 'PERSISTING_3D', evidence: `Observed on tracked chart for ${candidate.evidence.maxObservedDays} consecutive day(s).` };
  return { state: 'INSUFFICIENT_HISTORY', evidence: `Only ${candidate?.evidence?.maxObservedDays ?? 0} consecutive observed day(s); no 3-day direction is claimed.` };
}
function reasonDelta(currentReasons, previousReasons) {
  const current = new Set(Array.isArray(currentReasons) ? currentReasons : []);
  const previous = new Set(Array.isArray(previousReasons) ? previousReasons : []);
  return {
    added: [...current].filter((reason) => !previous.has(reason)).sort(),
    removed: [...previous].filter((reason) => !current.has(reason)).sort(),
  };
}
function isNewEntryOnlyReasonChange(added, removed) {
  const changed = [...added, ...removed];
  return changed.length > 0 && changed.every((reason) => /^NEW_ENTRY_TOP_(10|20)$/.test(reason));
}
function hasStrongExactOneDayReason(candidate) {
  return (candidate?.reasonCodes ?? []).some((reason) => /^UP_(8|15)_PLUS_1D$/.test(reason));
}
function queueEntrySignificance(candidate) {
  if ((candidate?.queueRank ?? 999) <= 3) {
    return { significance: 'attention', significanceReason: 'Entered the top three of the deterministic research queue.' };
  }
  if (hasStrongExactOneDayReason(candidate)) {
    return { significance: 'attention', significanceReason: 'Entry is supported by an exact 1-day rank improvement of at least 8 places.' };
  }
  return { significance: 'info', significanceReason: 'Entered the bounded top-12 triage queue without a top-three position or strong exact 1-day movement signal.' };
}
function queueDropSignificance(candidate) {
  if ((candidate?.queueRank ?? 999) <= 3) {
    return { significance: 'attention', significanceReason: 'A prior top-three research-queue candidate dropped out of the bounded top-12 queue.' };
  }
  return { significance: 'info', significanceReason: 'Dropped from the bounded top-12 triage queue; this is cutoff churn unless stronger evidence changes separately.' };
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
      const significance = queueEntrySignificance(candidate);
      changes.push({
        type: 'NEW_TO_RESEARCH_QUEUE',
        appId: candidate.appId,
        name: candidate.name,
        ...significance,
        queueRank: candidate.queueRank,
        researchPriority: candidate.researchPriority,
        reasonCodes: candidate.reasonCodes ?? [],
        evidence: [
          `Not present in the exact ${comparisonDate} queue.`,
          `Current deterministic research priority ${candidate.researchPriority}.`,
          `Current best Games rank #${candidate.evidence.bestRank} across ${candidate.evidence.marketCount} market(s).`,
          significance.significanceReason,
        ],
      });
      continue;
    }

    const priorityDelta = candidate.researchPriority - prior.researchPriority;
    if (Math.abs(priorityDelta) >= 10) {
      const reasons = reasonDelta(candidate.reasonCodes, prior.reasonCodes);
      const lifecycleNormalization = isNewEntryOnlyReasonChange(reasons.added, reasons.removed);
      const significance = lifecycleNormalization ? 'info' : 'attention';
      const significanceReason = lifecycleNormalization
        ? 'Only a one-day NEW_ENTRY priority bonus expired; no stronger rank-evidence reason changed.'
        : 'A 10+ point deterministic priority change includes rank-evidence changes beyond routine NEW_ENTRY bonus expiry.';
      const evidence = [
        `Deterministic research priority changed ${prior.researchPriority} → ${candidate.researchPriority}.`,
        `Priority delta ${priorityDelta > 0 ? '+' : ''}${priorityDelta}.`,
      ];
      if (reasons.added.length > 0) evidence.push(`Added rank-evidence reason codes: ${reasons.added.join(', ')}.`);
      if (reasons.removed.length > 0) evidence.push(`Removed rank-evidence reason codes: ${reasons.removed.join(', ')}.`);
      if (reasons.added.length === 0 && reasons.removed.length === 0) evidence.push('Reason-code set is unchanged; the numeric priority changed within the same deterministic evidence rules.');
      evidence.push(significanceReason);

      changes.push({
        type: priorityDelta > 0 ? 'PRIORITY_INCREASED' : 'PRIORITY_DECREASED',
        appId: candidate.appId,
        name: candidate.name,
        significance,
        significanceReason,
        previous: prior.researchPriority,
        current: candidate.researchPriority,
        delta: priorityDelta,
        reasonCodesAdded: reasons.added,
        reasonCodesRemoved: reasons.removed,
        evidence,
      });
    }

    const marketDelta = candidate.evidence.marketCount - prior.evidence.marketCount;
    if (marketDelta !== 0) {
      changes.push({
        type: marketDelta > 0 ? 'CROSS_MARKET_EXPANDED' : 'CROSS_MARKET_CONTRACTED',
        appId: candidate.appId,
        name: candidate.name,
        significance: 'attention',
        significanceReason: 'Healthy Games-chart market presence changed on the exact daily comparison.',
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
        significanceReason: 'Best-rank movement is preserved as context; the digest reserves attention for stronger multi-signal or maturity events.',
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
          significanceReason: `A previously unavailable exact ${days}-day evidence window is now directly comparable.`,
          evidence: [`Exact ${days}-day comparison is now available.`, `Best upward delta: ${currentSignal.bestUpwardDelta ?? 'unknown'}.`],
        });
      }
    }
  }

  for (const candidate of previous.candidates) {
    if (!currentById.has(String(candidate.appId))) {
      const significance = queueDropSignificance(candidate);
      changes.push({
        type: 'DROPPED_FROM_RESEARCH_QUEUE',
        appId: candidate.appId,
        name: candidate.name,
        ...significance,
        previousQueueRank: candidate.queueRank,
        previousResearchPriority: candidate.researchPriority,
        evidence: [
          `Present in the exact ${comparisonDate} queue but absent from the current queue.`,
          'This records only a deterministic triage cutoff change; no product-performance conclusion is made.',
          significance.significanceReason,
        ],
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
  statement: 'This digest reports exact observed changes between dated research queues. Attention is reserved for evidence changes worth interrupting the owner for; informational changes remain preserved. It does not predict success, downloads, revenue, or causal demand.',
  summary: {
    currentCandidateCount: current.candidates.length,
    changeCount: changes.length,
    attentionCount: changes.filter((change) => change.significance === 'attention').length,
    informationalCount: changes.filter((change) => change.significance === 'info').length,
    newCandidates: changes.filter((change) => change.type === 'NEW_TO_RESEARCH_QUEUE').length,
    droppedCandidates: changes.filter((change) => change.type === 'DROPPED_FROM_RESEARCH_QUEUE').length,
    marketChanges: changes.filter((change) => change.type.startsWith('CROSS_MARKET_')).length,
    maturityEvents: changes.filter((change) => /^EXACT_[37]D_HISTORY_MATURED$/.test(change.type)).length,
  },
  limitations: [
    'No previous exact-date queue means history_pending, not zero change.',
    'Priority changes reflect deterministic triage inputs, not changes in probability of commercial success.',
    'New/dropped queue membership is bounded top-12 triage churn unless stronger exact rank evidence independently crosses an attention rule.',
    'A one-day NEW_ENTRY bonus expiring is informational lifecycle normalization, not a market alert by itself.',
    'Dropped-from-queue is a triage state only and is not a claim about installs, revenue, retention or product quality.',
    'RISING/FALLING lifecycle states are only emitted when an exact 3-day rank comparison exists.',
  ],
  changes,
  states,
};

fs.mkdirSync(digestHistoryRoot, { recursive: true });
fs.writeFileSync(digestPath, `${JSON.stringify(digest, null, 2)}\n`);
fs.writeFileSync(path.join(digestHistoryRoot, `${current.radarDate}.json`), `${JSON.stringify(digest, null, 2)}\n`);
console.log(`[research-digest] ${digest.status} · ${digest.summary.changeCount} changes · ${digest.summary.attentionCount} attention · ${digest.summary.informationalCount} informational · ${states.length} states`);
