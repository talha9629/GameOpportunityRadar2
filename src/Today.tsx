import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, RefreshCw } from 'lucide-react';
import { fastestMovers, loadRadarSnapshot, newEntrants, type RadarEntry, type RadarSnapshot } from './radar';

function Movement({ entry }: { entry: RadarEntry }) {
  if (entry.delta == null) return <span className="movement new">NEW</span>;
  if (entry.delta > 0) return <span className="movement up"><ArrowUp size={13} /> {entry.delta}</span>;
  if (entry.delta < 0) return <span className="movement down"><ArrowDown size={13} /> {Math.abs(entry.delta)}</span>;
  return <span className="movement flat">—</span>;
}

function EntryRow({ entry, market }: { entry: RadarEntry; market?: string }) {
  return (
    <div className="radar-row">
      <div className="rank">#{entry.rank}</div>
      {entry.iconUrl && <img src={entry.iconUrl} alt="" />}
      <div className="radar-game"><strong>{entry.name}</strong><span>{entry.publisher}{market ? ` · ${market}` : ''}</span></div>
      <Movement entry={entry} />
      {entry.storeUrl && <a href={entry.storeUrl} target="_blank" rel="noreferrer" className="icon-link"><ExternalLink size={15} /></a>}
    </div>
  );
}

export function Today() {
  const [snapshot, setSnapshot] = useState<RadarSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState('us');

  async function refresh() {
    setLoading(true); setError(null);
    try { setSnapshot(await loadRadarSnapshot()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load Radar snapshot.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  const movers = useMemo(() => snapshot ? fastestMovers(snapshot, 8) : [], [snapshot]);
  const entrants = useMemo(() => snapshot ? newEntrants(snapshot, 8) : [], [snapshot]);
  const market = snapshot?.markets[selectedMarket] ?? null;
  const marketEntries = market?.entries.slice(0, 20) ?? [];
  const successfulMarkets = snapshot ? Object.values(snapshot.markets).filter((item) => item.status === 'ok').length : 0;

  return (
    <section className="today-shell">
      <div className="today-heading">
        <div><div className="eyebrow">RADAR · TODAY</div><h1>What is moving now?</h1><p>Daily Apple chart observations. Rank movement is evidence; it is not download share or revenue.</p></div>
        <button onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> {loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {!error && !snapshot?.generatedAt && <div className="panel empty-state"><h3>First Radar snapshot is being collected</h3><p>GitHub Actions will populate US, UK, Canada and Australia automatically. Until that first run finishes, no trend claim is shown.</p></div>}

      {snapshot?.generatedAt && <>
        <div className="radar-kpis">
          <div className="panel kpi"><span>Markets healthy</span><strong>{successfulMarkets}/4</strong></div>
          <div className="panel kpi"><span>Fast movers</span><strong>{movers.length}</strong></div>
          <div className="panel kpi"><span>New entries</span><strong>{entrants.length}</strong></div>
          <div className="panel kpi"><span>Snapshot</span><strong>{new Date(snapshot.generatedAt).toLocaleDateString()}</strong></div>
        </div>

        {Object.values(snapshot.markets).some((item) => item.status === 'ok' && item.gameFocused === false) && (
          <div className="warning-banner"><AlertTriangle size={18} /><span>At least one market fell back to Apple’s overall Top Free chart because the games-category RSS was unavailable. Those ranks are explicitly labeled and must not be read as Games-category rank.</span></div>
        )}

        <div className="radar-columns">
          <section className="panel"><div className="section-heading"><h2>Fastest Movers</h2><span>vs previous observed snapshot</span></div>{movers.length ? movers.map((entry) => <EntryRow key={`${entry.country}-${entry.appId}`} entry={entry} market={entry.market} />) : <p>No upward movers yet; at least two snapshots are needed.</p>}</section>
          <section className="panel"><div className="section-heading"><h2>New Entrants</h2><span>new to tracked range</span></div>{entrants.length ? entrants.map((entry) => <EntryRow key={`${entry.country}-${entry.appId}`} entry={entry} market={entry.market} />) : <p>No new entrants in this snapshot.</p>}</section>
        </div>

        <section className="panel market-panel">
          <div className="market-toolbar"><div><h2>Tracked Chart</h2><p>Top 20 shown from the latest tracked range.</p></div><div className="market-tabs">{Object.entries(snapshot.markets).map(([code, item]) => <button key={code} className={selectedMarket === code ? 'active' : ''} onClick={() => setSelectedMarket(code)}>{item.label}</button>)}</div></div>
          {market && <div className="source-strip"><span>{market.gameFocused ? 'Games-category chart' : 'Overall Top Free fallback'}</span><span>{market.sourceMode}</span>{market.warning && <span className="source-warning">{market.warning}</span>}</div>}
          {market?.status === 'failed' ? <div className="error-box">{market.error}</div> : marketEntries.map((entry) => <EntryRow key={entry.appId} entry={entry} />)}
        </section>
      </>}
    </section>
  );
}
