import { Clock3, Database, SearchCheck, Users, Video } from 'lucide-react';
import type { VerificationQueue, VerificationTask } from './verificationQueue';

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

export function VerificationQueuePanel({
  queue,
  onDeepVerify,
  onCompetitors,
}: {
  queue: VerificationQueue;
  onDeepVerify: (appId: string, name: string) => void;
  onCompetitors: () => void;
}) {
  const actionable = queue.tasks.filter((task) => task.automationState !== 'optional_external').slice(0, 12);

  return <section className="panel verification-queue-panel">
    <div className="section-heading">
      <div>
        <h2>Automated Verification Queue</h2>
        <p>Every task below is traceable to an explicit unresolved unknown. Radar routes the gap; evidence still has to resolve it.</p>
      </div>
      <span>{queue.summary.taskCount} traceable tasks</span>
    </div>

    <div className="verification-summary">
      <span><b>{queue.summary.readyForHumanEvidence}</b> evidence-ready</span>
      <span><b>{queue.summary.readyForHumanReview}</b> human-review</span>
      <span><b>{queue.summary.autoWaiting}</b> automated waiting</span>
      <span><b>{queue.summary.optionalExternal}</b> optional external</span>
    </div>

    <div className="verification-list">
      {actionable.map((task) => <div className={`verification-task impact-${task.impact}`} key={task.taskId}>
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
          {task.evidenceType === 'deep_verify_video' && <button onClick={() => onDeepVerify(task.appId, task.name)}>Open Deep Verify</button>}
          {task.evidenceType === 'competitor_map' && <button onClick={onCompetitors}>Open Competitors</button>}
          {task.evidenceType === 'exact_rank_history' && <em>No manual action</em>}
        </div>
      </div>)}
    </div>

    <p className="verification-boundary">No task can mark itself resolved. Deep Verify needs source footage, competitor relationships need human confirmation, and rank-history tasks mature only when exact dated observations exist.</p>
  </section>;
}
