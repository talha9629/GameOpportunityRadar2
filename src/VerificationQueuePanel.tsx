import { Clock3, Database, SearchCheck, Users, Video } from 'lucide-react';
import type { VerificationCaptureSession, VerificationQueue, VerificationTask } from './verificationQueue';
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
  onDeepVerify,
}: {
  session: VerificationCaptureSession;
  onDeepVerify: (appId: string, name: string) => void;
}) {
  return <div className={`verification-session impact-${session.impact}`}>
    <div className="verification-order">S{session.sessionOrder}</div>
    <div className="verification-icon"><Video size={16} /></div>
    <div className="verification-copy">
      <div className="verification-title"><strong>{session.name}</strong><span>ONE CAPTURE · {session.taskCount} GAPS</span></div>
      <b>{session.actionLabel}</b>
      <ul className="verification-session-unknowns">
        {session.unknowns.map((unknown, index) => <li key={session.taskIds[index]}>{unknown}</li>)}
      </ul>
      <small>{session.why}</small>
    </div>
    <div className="verification-action">
      <span>{session.impact} impact</span>
      <button onClick={() => onDeepVerify(session.appId, session.name)}>Open Deep Verify</button>
    </div>
  </div>;
}

export function VerificationQueuePanel({
  queue,
  onDeepVerify,
  onCompetitors,
}: {
  queue: VerificationQueue;
  onDeepVerify: (appId: string, name: string) => void;
  onCompetitors: () => void;
}) {
  const nonVideoActionable = queue.tasks
    .filter((task) => task.evidenceType !== 'deep_verify_video' && task.automationState !== 'optional_external')
    .slice(0, 12);

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
      <span><b>{queue.summary.readyForHumanReview}</b> human-review</span>
      <span><b>{queue.summary.autoWaiting}</b> automated waiting</span>
      <span><b>{queue.summary.optionalExternal}</b> optional external</span>
    </div>

    <div className="verification-session-heading">
      <div><strong>Evidence collection sessions</strong><span>One representative gameplay/menu capture can be reviewed against every atomic gap listed in that session.</span></div>
      <b>{queue.captureSessions.length} human capture actions</b>
    </div>
    <div className="verification-list verification-session-list">
      {queue.captureSessions.map((session) => <CaptureSession key={session.sessionId} session={session} onDeepVerify={onDeepVerify} />)}
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

    <p className="verification-boundary">Capture sessions reduce duplicate work only. They do not collapse or resolve the underlying unknowns: all {queue.summary.taskCount} atomic tasks remain canonical, Deep Verify still needs source footage, competitor relationships still need human confirmation, and rank-history tasks mature only when exact dated observations exist.</p>
  </section>;
}
