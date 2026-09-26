import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RESEARCH_PATH = path.resolve('public/data/research/latest.json');
const OUTPUT_DIR = path.resolve('public/data/verification');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'latest.json');
const MAX_CANDIDATES = 8;
const MAX_TASKS = 64;

const research = JSON.parse(await readFile(RESEARCH_PATH, 'utf8'));

function idFor(appId, unknown, evidenceType) {
  return createHash('sha256').update(`${appId}:${unknown}:${evidenceType}`, 'utf8').digest('hex').slice(0, 24);
}

function sessionIdFor(appId, taskIds) {
  return createHash('sha256')
    .update(`${appId}:${[...taskIds].sort().join(',')}:candidate_deep_verify_capture_session_v1`, 'utf8')
    .digest('hex')
    .slice(0, 24);
}

function routeUnknown(unknown) {
  const text = unknown.toLowerCase();

  if (text.includes('core mechanic') && text.includes('gameplay')) {
    return {
      category: 'gameplay_mechanic',
      evidenceType: 'deep_verify_video',
      evidenceMode: 'user_capture_or_public_youtube',
      impact: 'critical',
      automationState: 'ready_for_human_evidence',
      actionLabel: 'Deep Verify gameplay',
      why: 'A timestamped gameplay source can directly verify the core interaction loop without treating listing language as gameplay evidence.',
    };
  }

  if (text.includes('monetization placement') || (text.includes('monetization') && text.includes('gameplay'))) {
    return {
      category: 'monetization_placement',
      evidenceType: 'deep_verify_video',
      evidenceMode: 'user_capture_or_public_youtube',
      impact: 'high',
      automationState: 'ready_for_human_evidence',
      actionLabel: 'Verify monetization in gameplay',
      why: 'Timestamped gameplay can show where ads, offers, currencies, gates, or purchase prompts actually appear; the store listing cannot establish frequency or placement.',
    };
  }

  if (text.includes('meta progression') || text.includes('retention systems')) {
    return {
      category: 'meta_progression',
      evidenceType: 'deep_verify_video',
      evidenceMode: 'user_capture_or_public_youtube',
      impact: 'high',
      automationState: 'ready_for_human_evidence',
      actionLabel: 'Verify meta and retention loop',
      why: 'Gameplay/menu footage can directly expose progression, daily systems, rewards, lives, events, and other retention surfaces that are only partially visible in listing copy.',
    };
  }

  if (text.includes('competitor family') || text.includes('differentiation')) {
    return {
      category: 'competitor_relationship',
      evidenceType: 'competitor_map',
      evidenceMode: 'human_confirmed_relationships',
      impact: 'high',
      automationState: 'ready_for_human_review',
      actionLabel: 'Confirm competitor family',
      why: 'Competitor relationships and differentiation are judgment-bearing classifications, so Radar can propose evidence but a human must confirm the relationship.',
    };
  }

  if (text.includes('momentum') || text.includes('saturation') || text.includes('chart/trend history')) {
    return {
      category: 'market_history',
      evidenceType: 'exact_rank_history',
      evidenceMode: 'automated_daily_collection',
      impact: 'high',
      automationState: 'auto_waiting',
      actionLabel: 'Collect exact rank history',
      why: 'The scheduled Apple Radar collector is already gathering exact dated observations; no manual evidence can safely substitute for missing historical dates.',
    };
  }

  if (text.includes('download') || text.includes('revenue')) {
    return {
      category: 'performance_estimate',
      evidenceType: 'third_party_estimate',
      evidenceMode: 'optional_appbrain_or_manual_provider',
      impact: 'medium',
      automationState: 'optional_external',
      actionLabel: 'Add labeled third-party estimate',
      why: 'Official Apple metadata does not expose competitor downloads or revenue. Any added value must remain a clearly labeled third-party estimate and must not affect first-party research priority.',
    };
  }

  return {
    category: 'other_unknown',
    evidenceType: 'manual_evidence',
    evidenceMode: 'human_supplied_source',
    impact: 'medium',
    automationState: 'ready_for_human_evidence',
    actionLabel: 'Add supporting evidence',
    why: 'This unknown requires a source that directly supports or falsifies the claim; Radar will not infer the missing fact from unrelated evidence.',
  };
}

const impactOrder = { critical: 0, high: 1, medium: 2, low: 3 };
const candidates = (research.candidates ?? []).slice(0, MAX_CANDIDATES);
const tasks = [];

for (const candidate of candidates) {
  const unknowns = candidate.analysisEvidence?.unknowns ?? [];
  for (const unknown of unknowns) {
    const route = routeUnknown(unknown);
    tasks.push({
      taskId: idFor(candidate.appId, unknown, route.evidenceType),
      appId: candidate.appId,
      name: candidate.name,
      queueRank: candidate.queueRank,
      researchPriority: candidate.researchPriority,
      unknown,
      ...route,
      source: {
        researchGeneratedAt: research.generatedAt,
        analysisObservedAt: candidate.analysisEvidence?.observedAt ?? null,
        sourceOrigin: candidate.analysisEvidence?.sourceOrigin ?? 'official_public',
        sourceMode: candidate.analysisEvidence?.sourceMode ?? 'automated',
      },
    });
  }
}

tasks.sort((a, b) =>
  impactOrder[a.impact] - impactOrder[b.impact]
  || a.queueRank - b.queueRank
  || a.taskId.localeCompare(b.taskId),
);

const selected = tasks.slice(0, MAX_TASKS).map((task, index) => ({
  verificationOrder: index + 1,
  ...task,
}));
const omittedTaskCount = Math.max(0, tasks.length - selected.length);

const captureSessions = [];
for (const candidate of candidates) {
  const memberTasks = selected
    .filter((task) => task.appId === candidate.appId && task.evidenceType === 'deep_verify_video')
    .sort((a, b) => a.verificationOrder - b.verificationOrder);
  if (memberTasks.length === 0) continue;

  const taskIds = memberTasks.map((task) => task.taskId);
  captureSessions.push({
    sessionOrder: captureSessions.length + 1,
    sessionId: sessionIdFor(candidate.appId, taskIds),
    appId: candidate.appId,
    name: candidate.name,
    queueRank: candidate.queueRank,
    researchPriority: candidate.researchPriority,
    evidenceType: 'deep_verify_video',
    evidenceMode: 'user_capture_or_public_youtube',
    automationState: 'ready_for_human_evidence',
    impact: memberTasks.some((task) => task.impact === 'critical') ? 'critical' : 'high',
    actionLabel: 'Capture one gameplay session',
    why: 'One representative gameplay and menu capture can provide timestamped evidence for these related unknowns. Each atomic unknown remains unresolved until the captured evidence is reviewed against it.',
    taskCount: memberTasks.length,
    taskIds,
    unknowns: memberTasks.map((task) => task.unknown),
    categories: memberTasks.map((task) => task.category),
    source: {
      researchGeneratedAt: research.generatedAt,
      analysisObservedAt: candidate.analysisEvidence?.observedAt ?? null,
    },
  });
}

const summary = selected.reduce((acc, task) => {
  acc[task.automationState] = (acc[task.automationState] ?? 0) + 1;
  return acc;
}, {});
const groupedEvidenceTaskCount = captureSessions.reduce((sum, session) => sum + session.taskCount, 0);

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  researchGeneratedAt: research.generatedAt,
  radarDate: research.radarDate,
  statement: 'Verification Queue routes explicit unresolved Radar unknowns to admissible evidence. It does not create facts, predict success, or mark an unknown resolved without evidence.',
  method: {
    name: 'explicit_unknown_evidence_router_v1',
    candidateCap: MAX_CANDIDATES,
    taskCap: MAX_TASKS,
    ordering: ['evidence impact', 'research queue order', 'stable task id'],
    sessionGrouping: {
      name: 'candidate_deep_verify_capture_session_v1',
      rule: 'Group only deep_verify_video tasks for the same candidate. Atomic tasks remain canonical and unresolved until evidence review.',
    },
    prohibitedShortcuts: [
      'Listing wording cannot gameplay-verify mechanics.',
      'Missing dated rank history cannot be interpolated.',
      'Third-party estimates cannot become first-party facts.',
      'Competitor relationships cannot be human-confirmed automatically.',
    ],
  },
  summary: {
    candidateCount: candidates.length,
    rawTaskCount: tasks.length,
    taskCount: selected.length,
    omittedTaskCount,
    readyForHumanEvidence: summary.ready_for_human_evidence ?? 0,
    readyForHumanReview: summary.ready_for_human_review ?? 0,
    autoWaiting: summary.auto_waiting ?? 0,
    optionalExternal: summary.optional_external ?? 0,
    captureSessionCount: captureSessions.length,
    groupedEvidenceTaskCount,
  },
  captureSessions,
  tasks: selected,
};

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log(`[verification-queue] ${output.summary.taskCount}/${output.summary.rawTaskCount} tasks kept · omitted ${omittedTaskCount} · ${output.summary.captureSessionCount} capture session(s) cover ${output.summary.groupedEvidenceTaskCount} video task(s) · ${output.summary.readyForHumanReview} review-ready · ${output.summary.autoWaiting} auto-waiting · ${output.summary.optionalExternal} optional external`);
