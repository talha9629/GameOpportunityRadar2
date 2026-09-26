import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, RefreshCw, Search } from 'lucide-react';
import {
  assessRadarTrend,
  crossMarketLeaders,
  fastestMovers,
  historyMaturity,
  loadRadarWindow,
  newEntrants,
  rankVisibility,
  rankWindowChange,
  type RadarEntry,
  type RadarSnapshot,
  type RadarTrendAssessment,
  type RankWindowChange,
} from './radar';
import { loadResearchQueue, primaryMomentum, type ResearchQueue } from './researchQueue';
import { loadResearchDigest, type ResearchDigest } from './researchDigest';
import { ResearchDigestPanel } from './ResearchDigestPanel';
import { loadDataHealth, type DataHealth } from './dataHealth';
import { DataHealthPanel } from './DataHealthPanel';
import './researchQueue.css';

function Movement({ entry }: { entry: RadarEntry }) {
  if (entry.delta == null) return <span className="movement new">NEW</span>;
  if (entry.delta > 0) return <span className="movement up"><ArrowUp size={13} /> {entry.delta}</span>;
  if (entry.delta < 0) return <span className="movement down"><ArrowDown size={13} /> {Math.abs(entry.delta)}</span>;
  return <span className="movement flat">—</span>;
}

function RankWindow({ change }: { change: RankWindowChange }) {
  const prefix = `${change.days}d`;
  if (change.status === 'history_missing') return <span className="window-pill unknown" title={`No exact ${change.days}-day snapshot exists. No movement is inferred.`}>{prefix} ?</span>;
  if (change.status === 'market_failed') return <span className="window-pill unknown" title={`The ${change.days}-day comparison market failed collection.`}>{prefix} !</span>;
  if (change.status === 'not_ranked') return <span className="window-pill entered" title={`Not present in the tracked range exactly ${change.days} day(s) ago.`}>{prefix} IN</span>;
  const delta = change.delta ?? 0;
  const label = delta > 0 ? `+${delta}` : String(delta);
  const className = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return <span className={`window-pill ${className}`} title={`Exact ${change.days}-day rank change: #${change.priorRank} → #${change.currentRank}`}>{prefix} {label}</span>;
}

function TrendPill({ assessment }: { assessment: RadarTrendAssessment }) {
  const className = assessment.state === 'RISING'
    ? 'up'
    : assessment.state === 'DECLINING'
      ? 'down'
      : assessment.state === 'EMERGING'
        ? 'entered'
        : assessment.state === 'INSUFFICIENT_DATA'
          ? 'unknown'
          : 'flat';
  return <span className={`window-pill ${className}`} title={assessment.reason}>{assessment.state.replaceAll('_', ' ')}</span>;
}

function EntryRow({
  entry,
  market,
  marketCode,
  snapshot,
  history,
  onAnalyze,
}: {
  entry: RadarEntry;
  market?: string;
  marketCode?: string;
  snapshot?: RadarSnapshot;
  history?: RadarSnapshot[];
  onAnalyze: (appId: string) => void;
}) {
  const windows = snapshot && history && marketCode
    ? ([1, 3, 7] as const).map((days) => rankWindowChange(snapshot, history, marketCode, entry.appId, days))
    : [];
  const trend = snapshot && history && marketCode
    ? assessRadarTrend(snapshot, history, marketCode, entry.appId)
    : null;
  const observedDepth = snapshot && marketCode
    ? snapshot.chartDepth ?? snapshot.markets[marketCode]?.entries.length ?? 0
    : 0;
  const visibility = observedDepth > 0 ? rankVisibility(entry.rank, observedDepth) : null;

  return (
    <div className={`radar-row ${windows.length ? 'with-windows' : ''}`}>
      <div className="rank">#{entry.rank}</div>
      {entry.iconUrl && <img src={entry.iconUrl} alt="" />}
      <div className="radar-game"><strong>{entry.name}</strong><span>{entry.publisher}{market ? ` · ${market}` : ''}</span></div>
      <Movement entry={entry} />
      {windows.length > 0 && <div className="window-trend">
        {windows.map((change) => <RankWindow key={change.days} change={change} />)}
        {visibility != null && <span className="window-pill flat" title={`Bounded log-rank visibility within the observed Top ${observedDepth}: ln((N+1)/rank) / ln(N+1). This is not download share, revenue share, or probability.`}>VIS {Math.round(visibility * 100)}%</span>}
        {trend && <TrendPill assessment={trend} />}
      </div>}
      <div className="radar-actions">
        <button onClick={() => onAnalyze(entry.appId)} title={`Analyze ${entry.name}`}><Search size={14} /> Analyze</button>
        {entry.storeUrl && <a href={entry.storeUrl} target="_blank" rel="noreferrer" className="icon-link" title="Open App Store"><ExternalLink size={15} /></a>}
      </div>
    </div>
  );
}

function CrossMarketRow({ item, onAnalyze }: {
  item: ReturnType<typeof crossMarketLeaders>[number];
  onAnalyze: (appId: string) => void;
}) {
  return <div className="cross-market-row">
    {item.iconUrl && <img src={item.iconUrl} alt="" />}
    <div><strong>{item.name}</strong><span>{item.publisher}</span></div>
    <span className="market-count">{item.marketCount} markets</span>
    <span className="average-rank">avg #{item.averageRank.toFixed(1)}</span>
    <button onClick={() => onAnalyze(item.appId)}><Search size={14} /> Analyze</button>
  </div>;
}

function ResearchQueuePanel({ queue, onAnalyze }: { queue: ResearchQueue; onAnalyze: (appId: string) => void }) {
  const appBrainReady = queue.sources.appBrain.status !== 'unconfigured';
  const analyzerStatus = queue.sources.liveAnalyzer?.status ?? 'pending';
  return <section className="panel research-queue-panel">
    <div className="section-heading">
      <div><h2>Automated Research Queue</h2><p>Deterministic triage from first-party Apple Games chart evidence. Priority means “investigate first,” not “build this.”</p></div>
      <span>{queue.candidates.length} evidence-backed candidates</span>
    </div>
    <div className="research-queue-note">
      <span>Apple charts: {queue.sources.appleCharts.status}</span>
      <span>Apple metadata: {queue.sources.appleLookup.status}</span>
      <span className={analyzerStatus === 'complete' ? 'evidence-ok' : ''}>Live evidence packs: {analyzerStatus}</span>
      <span className={appBrainReady ? '' : 'estimate-off'}>AppBrain estimates: {queue.sources.appBrain.status}</span>
      <span>Updated {new Date(queue.generatedAt).toLocaleString()}</span>
    </div>
    {queue.candidates.length === 0 ? <p>No title currently meets the deterministic research-queue thresholds.</p> : <div className="research-queue-list">
      {queue.candidates.slice(0, 8).map((candidate) => {
        const listingFacts = candidate.analysisEvidence?.findings.filter((finding) => finding.key.startsWith('listing_')).slice(0, 3) ?? [];
        return <div className="research-queue-row" key={candidate.appId}>
          {candidate.iconUrl ? <img src={candidate.iconUrl} alt="" /> : <div />}
          <div className="queue-priority" title={candidate.priorityMeaning}><strong>{candidate.researchPriority}</strong><small>priority</small></div>
          <div className="queue-game">
            <strong>#{candidate.queueRank} {candidate.name}</strong>
            <span>{candidate.publisher}</span>
            <div className="queue-facts">
              <span>{candidate.evidence.marketCount} market{candidate.evidence.marketCount === 1 ? '' : 's'}</span>
              <span>best #{candidate.evidence.bestRank}</span>
              <span>{primaryMomentum(candidate)}</span>
              {candidate.appleMetadata?.releaseAgeDays != null && <span>{candidate.appleMetadata.releaseAgeDays}d since release</span>}
              {candidate.analysisEvidence && <span className="unknown-count">{candidate.analysisEvidence.unknownCount} unresolved unknowns</span>}
            </div>
            {listingFacts.length > 0 && <div className="queue-listing-evidence" title="Publisher-listing-derived; not gameplay verified">
              {listingFacts.map((finding) => <span key={finding.key}><b>{finding.label}:</b> {finding.value}</span>)}
            </div>}
          </div>
          <div className="queue-reasons">{candidate.reasonCodes.slice(0, 4).map((reason) => <span key={reason}>{reason.replaceAll('_', ' ')}</span>)}</div>
          <div className="queue-pack">
            {candidate.analysisEvidence
              ? <><strong>{candidate.analysisEvidence.findingCount} facts</strong><small>{candidate.analysisEvidence.listingFindingCount} listing-derived</small></>
              : <><strong>—</strong><small>pack pending</small></>}
          </div>
          <div className="queue-estimate">
            {candidate.appBrainEstimate?.estimatedRecentDownloads != null
              ? <><strong>{candidate.appBrainEstimate.estimatedRecentDownloads.toLocaleString()}</strong><small>AppBrain recent est.</small></>
              : <><strong>—</strong><small>estimate not used</small></>}
          </div>
          <button onClick={() => onAnalyze(candidate.appId)} title={`Analyze ${candidate.name}`}><Search size={14} /> Analyze</button>
        </div>;
      })}
    </div>}
  </section>;
}

export function Today({ onAnalyze }: { onAnalyze: (appId: string) => void }) {
  const [snapshot, setSnapshot] = useState<RadarSnapshot | null>(null);
  const [history, setHistory] = useState<RadarSnapshot[]>([]);
  const [researchQueue, setResearchQueue] = useState<ResearchQueue | null>(null);
  const [researchDigest, setResearchDigest] = useState<ResearchDigest | null>(null);
  const [dataHealth, setDataHealth] = useState<DataHealth | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState('us');

  async function refresh() {
    setLoading(true); setError(null); setQueueError(null); setDigestError(null); setHealthError(null);
    try {
      const window = await loadRadarWindow(8);
      setSnapshot(window.latest);
      setHistory(window.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Radar snapshot.');
    }
    try {
      setResearchQueue(await loadResearchQueue());
    } catch (err) {
      setResearchQueue(null);
      setQueueError(err instanceof Error ? err.message : 'Research queue has not been generated yet.');
    }
    try {
      setResearchDigest(await loadResearchDigest());
    } catch (err) {
      setResearchDigest(null);
      setDigestError(err instanceof Error ? err.message : 'Research digest has not been generated yet.');
    }
    try {
      setDataHealth(await loadDataHealth());
    } catch (err) {
      setDataHealth(null);
      setHealthError(err instanceof Error ? err.message : 'Data health has not been generated yet.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const movers = useMemo(() => snapshot ? fastestMovers(snapshot, 8) : [], [snapshot]);
  const entrants = useMemo(() => snapshot ? newEntrants(snapshot, 8) : [], [snapshot]);
  const crossMarket = useMemo(() => snapshot ? crossMarketLeaders(snapshot, 8).filter((item) => item.marketCount > 1) : [], [snapshot]);
  const maturity = useMemo(() => historyMaturity(history), [history]);
  const market = snapshot?.markets[selectedMarket] ?? null;
  const marketEntries = market?.entries.slice(0, 20) ?? [];
  const successfulMarkets = snapshot ? Object.values(snapshot.markets).filter((item) => item.status === 'ok').length : 0;
  const hasFallback = snapshot ? Object.values(snapshot.markets).some((item) => item.status === 'ok' && item.gameFocused === false) : false;
  const hasPreservedMarket = snapshot ? Object.values(snapshot.markets).some((item) => item.refreshStatus === 'preserved_same_day') : false;

  return (
    <section className="today-shell">
      <div className="today-heading">
        <div><div className="eyebrow">RADAR · TODAY</div><h1>What is moving now?</h1><p>Daily Apple chart observations. Rank movement and rank visibility describe the observed chart only; they are not download share, revenue, or success probability.</p></div>
        <button onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> {loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {!error && !snapshot?.generatedAt && <div className="panel empty-state"><h3>First Radar snapshot is being collected</h3><p>GitHub Actions will populate US, UK, Canada and Australia automatically. Until that first run finishes, no trend claim is shown.</p></div>}

      {snapshot?.generatedAt && <>
        <div className="radar-kpis">
          <div className="panel kpi"><span>Markets healthy</span><strong>{successfulMarkets}/4</strong></div>
          <div className="panel kpi"><span>History maturity</span><strong>{maturity.consecutiveDays}/7 days</strong><small>{maturity.label.replaceAll('_', ' ')}</small></div>
          <div className="panel kpi"><span>Fast movers</span><strong>{movers.length}</strong></div>
          <div className="panel kpi"><span>Tracked depth</span><strong>Top {snapshot.chartDepth ?? Math.max(0, ...Object.values(snapshot.markets).map((item) => item.entries.length))}</strong><small>per available market</small></div>
        </div>

        {maturity.consecutiveDays < 7 && (
          <div className="history-banner"><strong>History is still maturing.</strong><span>1d / 3d / 7d comparisons use exact dated snapshots only. “?” means the required date does not exist yet; Radar never smooths or invents the missing rank. Trend states remain insufficient until their evidence gate is met.</span></div>
        )}

        {(snapshot.runStatus === 'partial' || hasPreservedMarket) && (
          <div className="warning-banner"><AlertTriangle size={18} /><span>This collection is PARTIAL. Healthy markets remain usable, but at least one country was unavailable or retained from an earlier successful observation on the same day.</span></div>
        )}

        {hasFallback && (
          <div className="warning-banner"><AlertTriangle size={18} /><span>At least one market fell back to Apple’s overall Top Free chart because the games-category RSS was unavailable. Those ranks are explicitly labeled and must not be read as Games-category rank.</span></div>
        )}

        {dataHealth && <DataHealthPanel health={dataHealth} onAnalyze={onAnalyze} />}
        {!dataHealth && healthError && <div className="history-banner"><strong>Data Health pending.</strong><span>{healthError} The next Apple Radar automation will generate a factual pipeline-health report.</span></div>}

        {researchDigest && <ResearchDigestPanel digest={researchDigest} onAnalyze={onAnalyze} />}
        {!researchDigest && digestError && <div className="history-banner"><strong>Daily change digest pending.</strong><span>{digestError} The next Apple Radar run will generate it from exact dated queue evidence.</span></div>}

        {researchQueue && <ResearchQueuePanel queue={researchQueue} onAnalyze={onAnalyze} />}
        {!researchQueue && queueError && <div className="history-banner"><strong>Automated research queue pending.</strong><span>{queueError} The next Apple Radar run will generate it from the latest verified chart evidence.</span></div>}

        <div className="radar-columns">
          <section className="panel"><div className="section-heading"><h2>Fastest Movers</h2><span>vs previous observed daily snapshot</span></div>{movers.length ? movers.map((entry) => <EntryRow key={`${entry.country}-${entry.appId}`} entry={entry} market={entry.market} onAnalyze={onAnalyze} />) : <p>No upward movers yet; at least two daily snapshots are needed.</p>}</section>
          <section className="panel"><div className="section-heading"><h2>New Entrants</h2><span>new to tracked range</span></div>{entrants.length ? entrants.map((entry) => <EntryRow key={`${entry.country}-${entry.appId}`} entry={entry} market={entry.market} onAnalyze={onAnalyze} />) : <p>No new entrants in this snapshot.</p>}</section>
        </div>

        <section className="panel cross-market-panel">
          <div className="section-heading"><div><h2>Cross-Market Presence</h2><p>Titles simultaneously present in more than one healthy Games-category tracked market.</p></div><span>descriptive rank evidence only</span></div>
          {crossMarket.length ? crossMarket.map((item) => <CrossMarketRow key={item.appId} item={item} onAnalyze={onAnalyze} />) : <p>No multi-market overlap is available in the current healthy Games-category observations.</p>}
        </section>

        <section className="panel market-panel">
          <div className="market-toolbar"><div><h2>Tracked Chart</h2><p>Top 20 shown from the latest tracked range. Exact 1d / 3d / 7d changes, bounded rank visibility, and evidence-gated trend state appear beside each title when supported.</p></div><div className="market-tabs">{Object.entries(snapshot.markets).map(([code, item]) => <button key={code} className={selectedMarket === code ? 'active' : ''} onClick={() => setSelectedMarket(code)}>{item.label}{item.status === 'failed' ? ' ⚠' : ''}</button>)}</div></div>
          {market && <div className="source-strip"><span>{market.gameFocused ? 'Games-category chart' : 'Overall Top Free fallback'}</span><span>{market.sourceMode ?? 'source unavailable'}</span><span>Tracked {market.entries.length} rows</span>{market.observedAt && <span>Observed {new Date(market.observedAt).toLocaleString()}</span>}{market.refreshStatus === 'preserved_same_day' && <span className="source-warning">Earlier same-day observation preserved</span>}{market.warning && <span className="source-warning">{market.warning}</span>}</div>}
          {market?.status === 'failed' ? <div className="error-box">{market.error}</div> : marketEntries.map((entry) => <EntryRow key={entry.appId} entry={entry} marketCode={selectedMarket} snapshot={snapshot} history={history} onAnalyze={onAnalyze} />)}
        </section>
      </>}
    </section>
  );
}
