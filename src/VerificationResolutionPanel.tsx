import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, RotateCcw, ShieldCheck } from 'lucide-react';
import type { DeepVerifyVideoPayload } from './deepVerify';
import { formatTimestamp } from './deepVerify';
import {
  confirmedEventsForResolution,
  resolutionForTask,
  type VerificationResolutionCategory,
  type VerificationTaskResolution,
} from './verificationResolution';
import {
  listVerificationTaskResolutions,
  saveVerificationTaskResolution,
} from './verificationResolutionApi';

const keepOpenSummary = 'Human kept this verification task open for more evidence.';

export function VerificationResolutionPanel({ video }: { video: DeepVerifyVideoPayload }) {
  const session = video.verificationSession;
  const [resolutions, setResolutions] = useState<VerificationTaskResolution[]>([]);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    if (!session) {
      setResolutions([]);
      return;
    }
    try {
      setResolutions(await listVerificationTaskResolutions(session.taskIds));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load task resolutions.');
    }
  }

  useEffect(() => {
    setError(null);
    setMessage(null);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.videoId, session?.sessionId]);

  if (!session) return null;

  async function saveTask(
    index: number,
    state: 'resolved' | 'needs_more_evidence',
    eventId: string | null,
    summary: string,
  ) {
    const taskId = session.taskIds[index];
    setBusyTaskId(taskId);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveVerificationTaskResolution({
        taskId,
        sessionId: session.sessionId,
        sourceVideoId: video.videoId,
        sourceEventId: eventId,
        unknownSnapshot: session.unknowns[index],
        category: session.categories[index] as VerificationResolutionCategory,
        researchGeneratedAt: session.researchGeneratedAt,
        state,
        summary,
      });
      setResolutions((current) => [
        ...current.filter((row) => row.taskId !== taskId),
        saved,
      ]);
      setMessage(state === 'resolved'
        ? 'Atomic verification task resolved from a human-confirmed timestamped finding.'
        : 'Atomic verification task remains open for more evidence.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update verification task resolution.');
    } finally {
      setBusyTaskId(null);
    }
  }

  const resolvedCount = session.taskIds.filter((taskId) => resolutionForTask(resolutions, taskId)?.state === 'resolved').length;

  return <section className="panel deep-resolution-panel">
    <div className="section-heading">
      <div>
        <div className="eyebrow">HUMAN TASK RESOLUTION</div>
        <h2>Close only what the reviewed evidence answers.</h2>
        <p>A saved source is not enough. Radar accepts a resolved task only when you explicitly choose a category-matched timestamped finding that is already human-confirmed.</p>
      </div>
      <span>{resolvedCount}/{session.taskIds.length} resolved</span>
    </div>

    <div className="deep-resolution-list">
      {session.taskIds.map((taskId, index) => {
        const category = session.categories[index] as VerificationResolutionCategory;
        const current = resolutionForTask(resolutions, taskId);
        const candidates = confirmedEventsForResolution(category, video.events);
        const busy = busyTaskId === taskId;
        return <article className={`deep-event-card ${current?.state === 'resolved' ? 'resolution-resolved' : ''}`} key={taskId}>
          <div className="deep-event-top">
            <div>
              <span className="deep-time">#{index + 1}</span>
              <strong>{session.unknowns[index]}</strong>
            </div>
            <span className={current?.state === 'resolved' ? 'badge-human_confirmed' : 'badge-needs_more_evidence'}>
              {current?.state === 'resolved' ? 'resolved' : 'open'}
            </span>
          </div>

          {current?.state === 'resolved' && <div className="deep-note">
            <CheckCircle2 size={15} /> {current.summary}
            {current.resolvedAt && <small>Resolved {new Date(current.resolvedAt).toLocaleString()}</small>}
          </div>}

          {current?.state !== 'resolved' && candidates.length === 0 && <div className="deep-retention-note">
            <ShieldCheck size={17} />
            <span>No category-matched human-confirmed timestamped finding is available yet. Confirm an appropriate finding below before resolving this task.</span>
          </div>}

          {current?.state !== 'resolved' && candidates.length > 0 && <div className="deep-resolution-candidates">
            <strong>Confirmed findings that can resolve this task</strong>
            {candidates.map((event) => <div className="deep-resolution-candidate" key={event.eventId}>
              <span><Clock3 size={14} /> {formatTimestamp(event.startSeconds)}{event.endSeconds != null ? `–${formatTimestamp(event.endSeconds)}` : ''}</span>
              <p>{event.claim}</p>
              <button disabled={busy} onClick={() => void saveTask(index, 'resolved', event.eventId, event.claim)}>Resolve with this finding</button>
            </div>)}
          </div>}

          <div className="deep-review-actions">
            {current?.state === 'resolved'
              ? <button disabled={busy} onClick={() => void saveTask(index, 'needs_more_evidence', null, keepOpenSummary)}><RotateCcw size={14} /> Reopen — needs evidence</button>
              : <button disabled={busy || current?.state === 'needs_more_evidence'} onClick={() => void saveTask(index, 'needs_more_evidence', null, keepOpenSummary)}>Keep open — needs evidence</button>}
          </div>
        </article>;
      })}
    </div>

    {error && <div className="error-box">{error}</div>}
    {message && <div className="deep-success"><CheckCircle2 size={17} /> {message}</div>}
  </section>;
}
