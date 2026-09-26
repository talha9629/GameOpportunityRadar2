import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const queuePath = path.resolve('public/data/verification/latest.json');
const researchPath = path.resolve('public/data/research/latest.json');
if (!existsSync(queuePath)) throw new Error('Verification queue is missing.');
if (!existsSync(researchPath)) throw new Error('Research queue is missing.');

const queue = JSON.parse(await readFile(queuePath, 'utf8'));
const research = JSON.parse(await readFile(researchPath, 'utf8'));

if (queue.schemaVersion !== 1) throw new Error('Unsupported verification queue schemaVersion.');
if (queue.researchGeneratedAt !== research.generatedAt) throw new Error('Verification queue is not derived from the current research queue.');
if (queue.radarDate !== research.radarDate) throw new Error('Verification queue radarDate mismatch.');
if (!Array.isArray(queue.tasks) || queue.tasks.length > 32) throw new Error('Invalid verification task count.');
if (queue.method?.name !== 'explicit_unknown_evidence_router_v1') throw new Error('Unexpected verification routing method.');

const allowedEvidenceTypes = new Set(['deep_verify_video', 'competitor_map', 'exact_rank_history', 'third_party_estimate', 'manual_evidence']);
const allowedStates = new Set(['ready_for_human_evidence', 'ready_for_human_review', 'auto_waiting', 'optional_external']);
const allowedImpacts = new Set(['critical', 'high', 'medium', 'low']);
const candidateById = new Map((research.candidates ?? []).map((candidate) => [candidate.appId, candidate]));
const ids = new Set();
let priorOrder = 0;

for (const task of queue.tasks) {
  if (!/^[a-f0-9]{24}$/.test(task.taskId) || ids.has(task.taskId)) throw new Error(`Invalid/duplicate task id: ${task.taskId}`);
  ids.add(task.taskId);
  if (!Number.isInteger(task.verificationOrder) || task.verificationOrder !== priorOrder + 1) throw new Error('Verification order must be contiguous.');
  priorOrder = task.verificationOrder;
  if (!allowedEvidenceTypes.has(task.evidenceType)) throw new Error(`Invalid evidenceType for ${task.taskId}`);
  if (!allowedStates.has(task.automationState)) throw new Error(`Invalid automationState for ${task.taskId}`);
  if (!allowedImpacts.has(task.impact)) throw new Error(`Invalid impact for ${task.taskId}`);
  if (typeof task.unknown !== 'string' || task.unknown.length < 15) throw new Error(`Missing explicit unknown for ${task.taskId}`);
  if (typeof task.why !== 'string' || task.why.length < 30) throw new Error(`Missing evidence-routing rationale for ${task.taskId}`);

  const candidate = candidateById.get(task.appId);
  if (!candidate) throw new Error(`Task references unknown candidate ${task.appId}`);
  if (!candidate.analysisEvidence?.unknowns?.includes(task.unknown)) {
    throw new Error(`Task ${task.taskId} is not traceable to an explicit candidate unknown.`);
  }
  if (task.source?.researchGeneratedAt !== research.generatedAt) throw new Error(`Task ${task.taskId} has stale research provenance.`);

  if (task.evidenceType === 'deep_verify_video' && task.automationState !== 'ready_for_human_evidence') {
    throw new Error(`Deep Verify task ${task.taskId} must require human-supplied evidence.`);
  }
  if (task.evidenceType === 'exact_rank_history' && task.automationState !== 'auto_waiting') {
    throw new Error(`Exact-history task ${task.taskId} must remain auto_waiting.`);
  }
  if (task.evidenceType === 'third_party_estimate' && task.automationState !== 'optional_external') {
    throw new Error(`Estimate task ${task.taskId} must remain optional_external.`);
  }
  if (task.evidenceType === 'competitor_map' && task.automationState !== 'ready_for_human_review') {
    throw new Error(`Competitor task ${task.taskId} must require human review.`);
  }
}

const expected = queue.summary ?? {};
const actual = {
  readyForHumanEvidence: queue.tasks.filter((task) => task.automationState === 'ready_for_human_evidence').length,
  readyForHumanReview: queue.tasks.filter((task) => task.automationState === 'ready_for_human_review').length,
  autoWaiting: queue.tasks.filter((task) => task.automationState === 'auto_waiting').length,
  optionalExternal: queue.tasks.filter((task) => task.automationState === 'optional_external').length,
};
if (expected.taskCount !== queue.tasks.length) throw new Error('Verification summary taskCount mismatch.');
for (const [key, value] of Object.entries(actual)) {
  if (expected[key] !== value) throw new Error(`Verification summary ${key} mismatch.`);
}

console.log(`[verification-queue] validation PASS · ${queue.tasks.length} traceable tasks · ${actual.readyForHumanEvidence} evidence-ready · ${actual.readyForHumanReview} human-review · ${actual.autoWaiting} auto-waiting · ${actual.optionalExternal} optional`);
