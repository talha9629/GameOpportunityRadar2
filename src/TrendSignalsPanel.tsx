import { ArrowDown, ArrowUp, Search, TrendingUp } from 'lucide-react';
import { strongestTrendSignals, trendWindowStatusCounts, type TrendSignalsPayload } from './trendSignals';
import './trendSignals.css';

function evidenceWindow(signal: ReturnType<typeof strongestTrendSignals>[number]) {
  const days = signal.trend.evidenceDays[0];
  if (!days) return 'exact history gate not met';
  const window = signal.exactWindows[`${days}d` as '1d' | '3d' | '7d'];
  if (window.status !== 'available') return `${days}d ${window.status.replaceAll('_', ' ')}`;
  const delta = window.delta ?? 0;
  const direction = delta > 0 ? `+${delta}` : String(delta);
  return `${days}d #${window.priorRank} → #${window.currentRank} (${direction})`;
}

export function TrendSignalsPanel({ payload, onAnalyze }: {
  payload: TrendSignalsPayload;
  onAnalyze: (appId: string) => void;
}) {
  const strongest = strongestTrendSignals(payload, 12);
  const counts = payload.summary.stateCounts;
  const windowCounts = trendWindowStatusCounts(payload);
  const incomparable = windowCounts.coverage_gap + windowCounts.source_mismatch + windowCounts.market_failed;

  return <section className="panel trend-signals-panel">
    <div className="section-heading">
      <div>
        <h2>Exact-Date Trend Signals</h2>
        <p>Observed Apple Games rank evidence only. Visibility measures chart position inside Top {payload.chartDepth}; it is not installs, revenue, market share, or success probability.</p>
      </div>
      <span>{payload.summary.signalCount} signals · {payload.summary.healthyGameMarkets} markets</span>
    </div>

    <div className="trend-state-summary">
      {(['EMERGING', 'RISING', 'ESTABLISHED', 'DECLINING', 'INSUFFICIENT_DATA'] as const).map((state) => (
        <span key={state} className={`trend-state trend-${state.toLowerCase()}`}><b>{counts[state] ?? 0}</b> {state.replaceAll('_', ' ')}</span>
      ))}
    </div>

    <div className="trend-window-health" aria-label="Exact comparison health">
      <span><b>{windowCounts.available}</b> exact comparisons</span>
      <span><b>{windowCounts.history_missing}</b> missing exact dates</span>
      <span><b>{windowCounts.not_ranked}</b> comparable prior absences</span>
      {incomparable > 0 && <span className="warning"><b>{incomparable}</b> incomparable windows</span>}
      {windowCounts.coverage_gap > 0 && <small>{windowCounts.coverage_gap} window{windowCounts.coverage_gap === 1 ? '' : 's'} fall outside shallower historical chart coverage.</small>}
      {windowCounts.source_mismatch > 0 && <small>{windowCounts.source_mismatch} window{windowCounts.source_mismatch === 1 ? '' : 's'} use a different chart source and are excluded from direction.</small>}
      {windowCounts.market_failed > 0 && <small>{windowCounts.market_failed} comparison window{windowCounts.market_failed === 1 ? '' : 's'} could not be evaluated because that market failed collection.</small>}
    </div>

    {strongest.length === 0
      ? <div className="trend-empty"><TrendingUp size={18} /><span>No game currently crosses a conservative factual trend threshold. Exact history will keep accumulating automatically.</span></div>
      : <div className="trend-signal-list">{strongest.map((signal) => <div className="trend-signal-row" key={`${signal.country}-${signal.appId}-${signal.trend.state}`}>
          <div className="trend-rank">#{signal.rank}</div>
          <div className="trend-signal-copy">
            <div className="trend-signal-title"><strong>{signal.name}</strong><span>{signal.market}</span></div>
            <div className="trend-signal-facts">
              <span className={`trend-state trend-${signal.trend.state.toLowerCase()}`}>{signal.trend.state.replaceAll('_', ' ')}</span>
              <span>{evidenceWindow(signal)}</span>
              <span>visibility {(signal.visibility * 100).toFixed(1)}%</span>
              <span>{signal.daysObserved}d observed streak</span>
            </div>
            <small>{signal.trend.reason}</small>
          </div>
          <div className="trend-direction" aria-hidden="true">
            {signal.trend.state === 'DECLINING' ? <ArrowDown size={17} /> : <ArrowUp size={17} />}
          </div>
          <button onClick={() => onAnalyze(signal.appId)}><Search size={14} /> Analyze</button>
        </div>)}</div>}

    <p className="trend-boundary">CROWDED and WINDOW CLOSING are intentionally absent here. Those states require separate saturation / competitor-cluster evidence and cannot be inferred from rank movement alone.</p>
  </section>;
}
