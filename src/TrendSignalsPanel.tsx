import { ArrowDown, ArrowUp, Search, TrendingUp } from 'lucide-react';
import { strongestOneDayMovers, strongestTrendSignals, trendWindowStatusCounts, type TrendSignalsPayload } from './trendSignals';
import './trendSignals.css';

function stateLabel(state: string) {
  if (state === 'INSUFFICIENT_DATA') return 'History maturing';
  if (state === 'RISING') return 'Rising · exact 3d';
  if (state === 'DECLINING') return 'Declining · exact 3d';
  if (state === 'ESTABLISHED') return 'Established';
  if (state === 'EMERGING') return 'Emerging · exact 3d absence';
  return state.replaceAll('_', ' ').toLowerCase();
}

function evidenceWindow(signal: ReturnType<typeof strongestTrendSignals>[number]) {
  const days = signal.trend.evidenceDays[0];
  if (!days) return 'Mature trend gate not met';
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
  const oneDayMovers = strongestOneDayMovers(payload, 12);
  const counts = payload.summary.stateCounts;
  const windowCounts = trendWindowStatusCounts(payload);
  const incomparable = windowCounts.coverage_gap + windowCounts.source_mismatch + windowCounts.market_failed;

  return <section className="panel trend-signals-panel">
    <div className="section-heading">
      <div>
        <h2>Exact-Date Trend Signals</h2>
        <p>Observed Apple Games rank evidence only. One-day movement is shown numerically; mature directional states require exact 3-day evidence. Visibility measures chart position inside Top {payload.chartDepth}; it is not installs, revenue, market share, or success probability.</p>
      </div>
      <span>{payload.summary.signalCount} chart rows · {payload.summary.healthyGameMarkets} markets</span>
    </div>

    <div className="trend-state-summary">
      {(['EMERGING', 'RISING', 'ESTABLISHED', 'DECLINING', 'INSUFFICIENT_DATA'] as const).map((state) => (
        <span key={state} className={`trend-state trend-${state.toLowerCase()}`}><b>{counts[state] ?? 0}</b> {stateLabel(state)}</span>
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

    <div className="trend-subsection-heading">
      <div><strong>Latest exact 1-day movement</strong><span>Movement facts only; these do not assign a mature trend state.</span></div>
      <b>{oneDayMovers.length} shown</b>
    </div>
    {oneDayMovers.length === 0
      ? <div className="trend-empty"><TrendingUp size={18} /><span>No non-zero exact 1-day moves are available yet.</span></div>
      : <div className="trend-signal-list">{oneDayMovers.map((signal) => {
          const window = signal.exactWindows['1d'];
          const delta = window.delta ?? 0;
          return <div className="trend-signal-row trend-movement-row" key={`1d-${signal.country}-${signal.appId}`}>
            {signal.iconUrl ? <img className="trend-app-icon" src={signal.iconUrl} alt="" /> : <div className="trend-app-icon placeholder" />}
            <div className="trend-signal-copy">
              <div className="trend-signal-title"><strong>{signal.name}</strong><span>{signal.market}</span></div>
              <div className="trend-signal-facts">
                <span className={delta > 0 ? 'movement-fact up' : 'movement-fact down'}>{delta > 0 ? `↑ ${delta}` : `↓ ${Math.abs(delta)}`} ranks / 1d</span>
                <span>#{window.priorRank} → #{window.currentRank}</span>
                <span>current #{signal.rank}</span>
                <span>visibility {(signal.visibility * 100).toFixed(1)}%</span>
                <span>{signal.daysObserved}d observed streak</span>
              </div>
              <small>{signal.publisher}</small>
            </div>
            <div className={`trend-direction ${delta < 0 ? 'down' : ''}`} aria-hidden="true">{delta < 0 ? <ArrowDown size={17} /> : <ArrowUp size={17} />}</div>
            <button onClick={() => onAnalyze(signal.appId)}><Search size={14} /> Analyze</button>
          </div>;
        })}</div>}

    <div className="trend-subsection-heading">
      <div><strong>Mature trend states</strong><span>Only states that cross the conservative exact-history gate appear here.</span></div>
      <b>{strongest.length} shown</b>
    </div>
    {strongest.length === 0
      ? <div className="trend-empty"><TrendingUp size={18} /><span>No title currently crosses a mature trend threshold. Exact history will keep accumulating automatically; 1-day movement above remains available as factual context.</span></div>
      : <div className="trend-signal-list">{strongest.map((signal) => <div className="trend-signal-row" key={`${signal.country}-${signal.appId}-${signal.trend.state}`}>
          {signal.iconUrl ? <img className="trend-app-icon" src={signal.iconUrl} alt="" /> : <div className="trend-app-icon placeholder" />}
          <div className="trend-signal-copy">
            <div className="trend-signal-title"><strong>{signal.name}</strong><span>{signal.market}</span></div>
            <div className="trend-signal-facts">
              <span className={`trend-state trend-${signal.trend.state.toLowerCase()}`}>{stateLabel(signal.trend.state)}</span>
              <span>{evidenceWindow(signal)}</span>
              <span>visibility {(signal.visibility * 100).toFixed(1)}%</span>
              <span>{signal.daysObserved}d observed streak</span>
            </div>
            <small>{signal.trend.reason}</small>
          </div>
          <div className={`trend-direction ${signal.trend.state === 'DECLINING' ? 'down' : ''}`} aria-hidden="true">
            {signal.trend.state === 'DECLINING' ? <ArrowDown size={17} /> : <ArrowUp size={17} />}
          </div>
          <button onClick={() => onAnalyze(signal.appId)}><Search size={14} /> Analyze</button>
        </div>)}</div>}

    <p className="trend-boundary">CROWDED and WINDOW CLOSING are intentionally absent here. Those states require separate saturation / competitor-cluster evidence and cannot be inferred from rank movement alone.</p>
  </section>;
}
