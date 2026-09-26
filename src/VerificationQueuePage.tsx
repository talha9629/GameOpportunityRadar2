import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { VerificationQueuePanel } from './VerificationQueuePanel';
import { loadVerificationQueue, type VerificationCaptureSession, type VerificationQueue } from './verificationQueue';

export function VerificationQueuePage({
  onDeepVerify,
  onCompetitors,
}: {
  onDeepVerify: (session: VerificationCaptureSession) => void;
  onCompetitors: () => void;
}) {
  const [queue, setQueue] = useState<VerificationQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setQueue(await loadVerificationQueue());
    } catch (err) {
      setQueue(null);
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
        <p>Tasks are generated only from explicit evidence gaps already recorded by Radar. Nothing is silently inferred or marked resolved.</p>
      </div>
      <button onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> {loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    {queue && <VerificationQueuePanel queue={queue} onDeepVerify={onDeepVerify} onCompetitors={onCompetitors} />}
  </section>;
}
