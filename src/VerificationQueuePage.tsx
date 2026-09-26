import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { VerificationQueuePanel } from './VerificationQueuePanel';
import { loadVerificationQueue, type VerificationCaptureSession, type VerificationQueue } from './verificationQueue';
import { listVerificationSessionEvidence } from './verificationEvidenceApi';
import type { VerificationSessionEvidence } from './verificationEvidence';
import { listVerificationTaskResolutions } from './verificationResolutionApi';
import type { VerificationTaskResolution } from './verificationResolution';
import { loadGameplayDiscovery, type GameplayDiscovery } from './gameplayDiscovery';

export function VerificationQueuePage({
  onDeepVerify,
  onCompetitors,
}: {
  onDeepVerify: (session: VerificationCaptureSession, videoId?: string) => void;
  onCompetitors: () => void;
}) {
  const [queue, setQueue] = useState<VerificationQueue | null>(null);
  const [evidence, setEvidence] = useState<VerificationSessionEvidence[]>([]);
  const [resolutions, setResolutions] = useState<VerificationTaskResolution[]>([]);
  const [discovery, setDiscovery] = useState<GameplayDiscovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    setEvidenceError(null);
    setResolutionError(null);
    setDiscoveryError(null);
    try {
      const nextQueue = await loadVerificationQueue();
      setQueue(nextQueue);
      const sessionIds = nextQueue.captureSessions.map((session) => session.sessionId);
      const taskIds = nextQueue.captureSessions.flatMap((session) => session.taskIds);
      const [evidenceResult, resolutionResult, discoveryResult] = await Promise.allSettled([
        listVerificationSessionEvidence(sessionIds),
        listVerificationTaskResolutions(taskIds),
        loadGameplayDiscovery(),
      ]);

      if (evidenceResult.status === 'fulfilled') {
        setEvidence(evidenceResult.value);
      } else {
        setEvidence([]);
        setEvidenceError(evidenceResult.reason instanceof Error ? evidenceResult.reason.message : 'Owner verification evidence could not be loaded.');
      }

      if (resolutionResult.status === 'fulfilled') {
        setResolutions(resolutionResult.value);
      } else {
        setResolutions([]);
        setResolutionError(resolutionResult.reason instanceof Error ? resolutionResult.reason.message : 'Owner verification resolutions could not be loaded.');
      }

      if (discoveryResult.status === 'fulfilled') {
        if (discoveryResult.value.verificationGeneratedAt === nextQueue.generatedAt) {
          setDiscovery(discoveryResult.value);
        } else {
          setDiscovery(null);
          setDiscoveryError('Public gameplay suggestions are stale relative to the current verification queue, so Radar hid them until the next discovery run.');
        }
      } else {
        setDiscovery(null);
        setDiscoveryError(discoveryResult.reason instanceof Error ? discoveryResult.reason.message : 'Public gameplay source discovery could not be loaded.');
      }
    } catch (err) {
      setQueue(null);
      setEvidence([]);
      setResolutions([]);
      setDiscovery(null);
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
        <p>Tasks are generated only from explicit evidence gaps already recorded by Radar. Owner evidence and human resolution progress are overlaid separately; public search results remain suggestions until inspected in Deep Verify.</p>
      </div>
      <button onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> {loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    {queue && <VerificationQueuePanel
      queue={queue}
      evidence={evidence}
      resolutions={resolutions}
      discovery={discovery}
      evidenceError={evidenceError}
      resolutionError={resolutionError}
      discoveryError={discoveryError}
      onDeepVerify={onDeepVerify}
      onCompetitors={onCompetitors}
    />}
  </section>;
}
