import { Clock3, Database, SearchCheck, Users, Video } from 'lucide-react';
import type { VerificationCaptureSession, VerificationQueue, VerificationTask } from './verificationQueue';
import {
  evidenceCountForSession,
  latestEvidenceForSession,
  type VerificationSessionEvidence,
} from './verificationEvidence';
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
  onDeepVerify,
}: {
  session: VerificationCaptureSession;
  evidence: VerificationSessionEvidence[];
  onDeepVerify: (session: VerificationCaptureSession) => void;
}) {
  const latest = latestEvidenceForSession(evidence, session.sessionId);
  const evidenceCount = evidenceCountForSession(evidence, session.sessionId);

  return <div className={`verification-session impact-${session.impact} ${latest ? 'has-evidence' : ''}`}>
    <div className="verification-order">S{session.sessionOrder}</div>
    <div className="verification-icon"><Video size={16} /></div>
    <div className="verification-copy">
      <div className="verification-title">
        <strong>{session.name}</strong>
        <span>{latest ? `EVIDENCE COLLECTED · ${evidenceCount} SOURCE${evidenceCount === 1 ? '' : 'S'}` : `ONE CAPTURE · ${session.taskCount} GAPS`}</span>
      </div>
      <b>{latest ? 'Source saved; evidence review still required' : session.actionLabel}</b>
      <ul className="verification-session-unknowns">
        {session.unknowns.map((unknown, index) => <li key={session.taskIds[index]}>{unknown}</li>)}
      </ul>
      <small>{latest
        ? `Latest linked source saved ${new Date(latest.createdAt).toLocaleString()}. Saving a source does not establish that any listed claim is supported or disproven.`
        : session.why}</small>
    </div>
    <div className="verification-action">
      <span>{session.impact} impact</span>
      <button onClick={() => onDeepVerify(session)}>{latest ? 'Review / add evidence' : 'Collect evidence'}</button>
      {latest && <em>{latest.sourceType === 'upload' ? 'Private upload' : 'YouTube source'} · {latest.status.replaceAll('_', ' ')}</em>}
    </div>
  </div>;
}

export function VerificationQueuePanel({
  queue,
  evidence,
  evidenceError = null,
  onDeepVerify,
  onCompetitors,
}: {
  queue: VerificationQueue;
  evidence: VerificationSessionEvidence[];
  evidenceError?: string | null;
  onDeepVerify: (session: VerificationCaptureSession) => void;
  onCompetitors: () => void;
}) {
  const nonVideoActionable = queue.tasks
    .filter((task) => task.evidenceType !== 'deep_verify_video' && task.automationState !== 'optional_external')
    .slice(0, 12);
  const sessionsWithEvidence = queue.captureSessions.filter((session) => evidenceCountForSession(evidence, session.sessionId) > 0).length;

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
      <span><b>{queue.summary.groupedEvidenceTaskCount}</b> gameplay gaps covered</span>
      <span><b>{sessionsWithEvidence}</b> sessions with saved evidence</span>
      <span><b>{queue.summary.readyForHumanReview}</b> human-review</span>
      <span><b>{queue.summary.autoWaiting}</b> automated waiting</span>
      <span><b>{queue.summary.optionalExternal}</b> optional external</span>
    </div>

    {evidenceError && <div className="verification-progress-warning">Generated verification work is still available, but owner evidence progress could not be loaded: {evidenceError}</div>}

    <div className="verification-session-heading">
      <div><strong>Evidence collection sessions</strong><span>One representative gameplay/menu capture can be reviewed against every atomic gap listed in that session. Saved evidence is owner-scoped and does not alter the generated queue.</span></div>
      <b>{queue.captureSessions.length - sessionsWithEvidence} capture action{queue.captureSessions.length - sessionsWithEvidence === 1 ? '' : 's'} still need evidence</b>
    </div>
    <div className="verification-list verification-session-list">
      {queue.captureSessions.map((session) => <CaptureSession key={session.sessionId} session={session} evidence={evidence} onDeepVerify={onDeepVerify} />)}
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

    <p className="verification-boundary">Evidence collected means only that an owner-linked source exists for the exact capture session. It does not resolve, support, or disprove the underlying unknowns. All {queue.summary.taskCount} atomic tasks remain canonical until their evidence is explicitly reviewed.</p>
  </section>;
}
