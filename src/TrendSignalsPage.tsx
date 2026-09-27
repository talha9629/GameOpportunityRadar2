import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { EvidenceLegend } from './EvidenceLegend';
import { TrendSignalsPanel } from './TrendSignalsPanel';
import { loadTrendSignals, type TrendSignalsPayload } from './trendSignals';

export function TrendSignalsPage({ onAnalyze }: { onAnalyze: (appId: string) => void }) {
  const [payload, setPayload] = useState<TrendSignalsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setPayload(await loadTrendSignals());
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : 'Trend signals are not available yet.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return <section className="today-shell">
    <div className="today-heading">
      <div>
        <div className="eyebrow">RADAR · TRENDS</div>
        <h1>What does the exact chart history support?</h1>
        <p>Conservative, inspectable Apple Games trend states from exact dated rank observations. Missing dates stay unknown.</p>
      </div>
      <button onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> {loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    <EvidenceLegend />
    {error && <div className="error-box">{error}</div>}
    {payload && <TrendSignalsPanel payload={payload} onAnalyze={onAnalyze} />}
  </section>;
}
