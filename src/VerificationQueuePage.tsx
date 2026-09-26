import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { VerificationQueuePanel } from './VerificationQueuePanel';
import { loadVerificationQueue, type VerificationCaptureSession, type VerificationQueue } from './verificationQueue';
import { listVerificationSessionEvidence } from './verificationEvidenceApi';
import type { VerificationSessionEvidence } from './verificationEvidence';

export function VerificationQueuePage({
  onDeepVerify,
  onCompetitors,
}: {
  onDeepVerify: (session: VerificationCaptureSession, videoId?: string) => void;
  onCompetitors: () => void;
}) {
  const [queue, setQueue] = useState<VerificationQueue | null>(null);
  const [evidence, setEvidence] = useState<VerificationSessionEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    setEvidenceError(null);
    try {
      const nextQueue = await loadVerificationQueue();
      setQueue(nextQueue);
      try {
        setEvidence(await listVerificationSessionEvidence(nextQueue.captureSessions.map((session) => session.sessionId)));
      } catch (err) {
        setEvidence([]);
        setEvidenceError(err instanceof Error ? err.message : 'Owner verification evidence could not be loaded.');
      }
    } catch (err) {
      setQueue(null);
      setEvidence([]);
      setError(err instanceof Error ? err.message : 'Verification Queue is not available yet.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return <section className="today-shell">
    <div className="today-heading">
      <div>
        <div className="eyebrow">VERIFY · QUEUE</div>
        <h1>Resolve the unknowns that matter.</h1>
        <p>Tasks are generated only from explicit evidence gaps already recorded by Radar. Owner-linked evidence progress is overlaid separately; nothing is silently inferred or marked resolved.</p>
      </div>
      <button onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> {loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    {queue && <VerificationQueuePanel queue={queue} evidence={evidence} evidenceError={evidenceError} onDeepVerify={onDeepVerify} onCompetitors={onCompetitors} />}
  </section>;
}
