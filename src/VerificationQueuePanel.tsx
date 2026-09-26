import { Clock3, Database, SearchCheck, Users, Video } from 'lucide-react';
import type { VerificationCaptureSession, VerificationQueue, VerificationTask } from './verificationQueue';
import {
  evidenceCountForSession,
  latestEvidenceForSession,
  type VerificationSessionEvidence,
} from './verificationEvidence';
import {
  resolvedTaskCount,
  type VerificationTaskResolution,
} from './verificationResolution';
import './verificationQueue.css';

function TaskIcon({ task }: { task: VerificationTask }) {
  if (task.evidenceType === 'deep_verify_video') return <Video size={16} />;
  if (task.evidenceType === 'competitor_map') return <Users size={16} />;
  if (task.evidenceType === 'exact_rank_history') return <Clock3 size={16} />;
  if (task.evidenceType === 'third_party_estimate') return <Database size={16} />;
  return <SearchCheck size={16} />;
}

function stateLabel(task: VerificationTask) {
  if (task.automationState === 'auto_waiting') return 'AUTOMATED';
  if (task.automationState === 'optional_external') return 'OPTIONAL';
  if (task.automationState === 'ready_for_human_review') return 'HUMAN REVIEW';
  return 'EVIDENCE NEEDED';
}

function CaptureSession({
  session,
  evidence,
  resolutions,
  onDeepVerify,
}: {
  session: VerificationCaptureSession;
  evidence: VerificationSessionEvidence[];
  resolutions: VerificationTaskResolution[];
  onDeepVerify: (session: VerificationCaptureSession, videoId?: string) => void;
}) {
  const latest = latestEvidenceForSession(evidence, session.sessionId);
  const evidenceCount = evidenceCountForSession(evidence, session.sessionId);
  const resolvedCount = resolvedTaskCount(resolutions, session.taskIds);
  const fullyResolved = resolvedCount === session.taskCount;

  return <div className={`verification-session impact-${session.impact} ${latest ? 'has-evidence' : ''} ${fullyResolved ? 'is-resolved' : ''}`}>
    <div className="verification-order">S{session.sessionOrder}</div>
    <div className="verification-icon"><Video size={16} /></div>
    <div className="verification-copy">
      <div className="verification-title">
        <strong>{session.name}</strong>
        <span>{fullyResolved
          ? `HUMAN RESOLVED · ${resolvedCount}/${session.taskCount} GAPS`
          : latest
            ? `EVIDENCE COLLECTED · ${resolvedCount}/${session.taskCount} RESOLVED`
            : `ONE CAPTURE · ${session.taskCount} GAPS`}</span>
      </div>
      <b>{fullyResolved
        ? 'All atomic gaps were explicitly resolved from human-confirmed findings'
        : latest
          ? 'Source saved; unresolved gaps still require human review'
          : session.actionLabel}</b>
      <ul className="verification-session-unknowns">
        {session.unknowns.map((unknown, index) => {
          const resolved = resolutions.find((row) => row.taskId === session.taskIds[index] && row.state === 'resolved');
          return <li key={session.taskIds[index]}>{resolved ? `Resolved: ${unknown}` : unknown}</li>;
        })}
      </ul>
      <small>{fullyResolved
        ? 'This is an owner review overlay. The canonical generated queue remains unchanged and the cited source/findings remain the evidence authority.'
        : latest
          ? `Latest linked source saved ${new Date(latest.createdAt).toLocaleString()}. Saving a source alone never resolves a gap.`
          : session.why}</small>
    </div>
    <div className="verification-action">
      <span>{session.impact} impact</span>
      <button onClick={() => onDeepVerify(session, latest?.videoId)}>{latest ? 'Open saved evidence' : 'Collect evidence'}</button>
      {latest && <em>{latest.sourceType === 'upload' ? 'Private upload' : 'YouTube source'} · {latest.status.replaceAll('_', ' ')}</em>}
    </div>
  </div>;
}

export function VerificationQueuePanel({
  queue,
  evidence,
  resolutions,
  evidenceError = null,
  resolutionError = null,
  onDeepVerify,
  onCompetitors,
}: {
  queue: VerificationQueue;
  evidence: VerificationSessionEvidence[];
  resolutions: VerificationTaskResolution[];
  evidenceError?: string | null;
  resolutionError?: string | null;
  onDeepVerify: (session: VerificationCaptureSession, videoId?: string) => void;
  onCompetitors: () => void;
}) {
  const nonVideoActionable = queue.tasks
    .filter((task) => task.evidenceType !== 'deep_verify_video' && task.automationState !== 'optional_external')
    .slice(0, 12);
  const sessionsWithEvidence = queue.captureSessions.filter((session) => evidenceCountForSession(evidence, session.sessionId) > 0).length;
  const fullyResolvedSessions = queue.captureSessions.filter((session) => resolvedTaskCount(resolutions, session.taskIds) === session.taskCount).length;
  const resolvedVideoTasks = resolvedTaskCount(resolutions, queue.captureSessions.flatMap((session) => session.taskIds));

  return <section className="panel verification-queue-panel">
    <div className="section-heading">
      <div>
        <h2>Automated Verification Queue</h2>
        <p>Every atomic task remains traceable to an explicit unresolved unknown. Related gameplay gaps are grouped into one capture session per candidate to reduce repeated evidence collection.</p>
      </div>
      <span>{queue.summary.taskCount} atomic tasks</span>
    </div>

    <div className="verification-summary">
      <span><b>{queue.summary.captureSessionCount}</b> capture sessions</span>
      <span><b>{queue.summary.groupedEvidenceTaskCount}</b> gameplay gaps</span>
      <span><b>{resolvedVideoTasks}</b> human-resolved video tasks</span>
      <span><b>{fullyResolvedSessions}</b> fully resolved sessions</span>
      <span><b>{sessionsWithEvidence}</b> sessions with evidence</span>
      <span><b>{queue.summary.autoWaiting}</b> automated waiting</span>
    </div>

    {evidenceError && <div className="verification-progress-warning">Generated verification work is still available, but owner evidence progress could not be loaded: {evidenceError}</div>}
    {resolutionError && <div className="verification-progress-warning">Generated verification work and saved evidence are still available, but human task resolutions could not be loaded: {resolutionError}</div>}

    <div className="verification-session-heading">
      <div><strong>Evidence collection sessions</strong><span>One representative gameplay/menu capture can be reviewed against every atomic gap listed in that session. Owner evidence and resolution overlays never rewrite the generated queue.</span></div>
      <b>{queue.captureSessions.length - fullyResolvedSessions} session{queue.captureSessions.length - fullyResolvedSessions === 1 ? '' : 's'} still have open gaps</b>
    </div>
    <div className="verification-list verification-session-list">
      {queue.captureSessions.map((session) => <CaptureSession key={session.sessionId} session={session} evidence={evidence} resolutions={resolutions} onDeepVerify={onDeepVerify} />)}
    </div>

    <div className="verification-session-heading secondary">
      <div><strong>Other verification work</strong><span>Relationship judgments stay human-reviewed; exact rank history keeps collecting automatically.</span></div>
    </div>
    <div className="verification-list">
      {nonVideoActionable.map((task) => <div className={`verification-task impact-${task.impact}`} key={task.taskId}>
        <div className="verification-order">#{task.verificationOrder}</div>
        <div className="verification-icon"><TaskIcon task={task} /></div>
        <div className="verification-copy">
          <div className="verification-title"><strong>{task.name}</strong><span>{stateLabel(task)}</span></div>
          <b>{task.actionLabel}</b>
          <p>{task.unknown}</p>
          <small>{task.why}</small>
        </div>
        <div className="verification-action">
          <span>{task.impact} impact</span>
          {task.evidenceType === 'competitor_map' && <button onClick={onCompetitors}>Open Competitors</button>}
          {task.evidenceType === 'exact_rank_history' && <em>No manual action</em>}
        </div>
      </div>)}
    </div>

    <p className="verification-boundary">Human resolved means an owner explicitly cited a category-matched timestamped finding already marked human-confirmed. Evidence collection alone never resolves a task. The canonical generated queue remains immutable and all resolution state is stored separately with source provenance.</p>
  </section>;
}
