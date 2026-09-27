import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Search } from 'lucide-react';
import { Today } from './Today';
import { loadGooglePlayRadar, type GooglePlayRadar } from './googlePlayRadar';
import { PlatformContextPanel } from './PlatformContextPanel';
import type { PlatformScope } from './platformScope';

function GooglePlayHome() {
  const [data, setData] = useState<GooglePlayRadar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  async function refresh() {
    setError(null);
    try { setData(await loadGooglePlayRadar()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load Google Play discovery data.'); }
  }

  useEffect(() => { void refresh(); }, []);
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    const entries = data?.entries ?? [];
    if (!value) return entries;
    return entries.filter((entry) => `${entry.name} ${entry.publisher} ${entry.packageName}`.toLowerCase().includes(value));
  }, [data, query]);

  return <section className="today-shell">
    <div className="today-heading"><div><div className="eyebrow">GOOGLE PLAY · HUNT</div><h1>Android opportunity discovery.</h1><p>Provider-backed Android game discovery. Google Play data is never inferred from Apple ranks.</p></div><button onClick={() => void refresh()}><RefreshCw size={16} /> Refresh</button></div>
    {error && <div className="error-box">{error}</div>}
    <section className="panel platform-research-empty">
      <div className="platform-context-head"><div><h2>Automation source</h2><p>AppBrain provides the automated Android market-intelligence layer because Google’s official Developer API is account/app-owner oriented rather than a public competitor-chart API.</p></div><span className={`capability-status ${data?.status === 'ok' ? 'live' : 'assisted'}`}>{data?.status ?? 'loading'}</span></div>
      {data?.status === 'unconfigured' && <div className="platform-source-note">APPBRAIN_API_KEY is not configured. Radar is intentionally showing no Google Play candidates rather than recycling Apple results. Once the key is added to GitHub Actions, this page will populate automatically on the next scheduled run.</div>}
      {data?.status === 'failed' && <div className="error-box">Provider collection failed: {data.error}</div>}
      {data?.status === 'ok' && <>
        <div className="platform-source-note"><strong>Coverage verified:</strong> exact {data.completeness?.received}/{data.completeness?.requested} unique AppBrain provider results. These are <strong>AppBrain popularity positions</strong>, not official Google Play storefront ranks.</div>
        <div className="search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by game, publisher, or Android package" /><button disabled><Search size={16} /> {filtered.length} matches</button></div>
        <div className="deep-library-list">{filtered.slice(0, 30).map((entry) => <a key={entry.packageName} href={entry.storeUrl} target="_blank" rel="noreferrer" className="platform-capability-card">
          <div className="platform-context-head"><div><strong>#{entry.rank} {entry.name}</strong><p>{entry.publisher} · {entry.packageName}</p></div>{entry.iconUrl && <img src={entry.iconUrl} alt="" width="44" height="44" />}</div>
          <div className="market-strip">
            <span className="market-chip">AppBrain position <b>#{entry.rank}</b></span>
            {entry.observedDelta != null && <span className="market-chip">Δ vs prior AppBrain observation <b>{entry.observedDelta > 0 ? `+${entry.observedDelta}` : entry.observedDelta}</b>{entry.observationGapDays != null ? ` / ${entry.observationGapDays}d gap` : ''}</span>}
            <span className="market-chip">Successful snapshots <b>{entry.observations}</b></span>
          </div>
          <div className="platform-source-note">Provider position: third-party public · Downloads: {entry.estimatedRecentDownloads != null ? `${entry.estimatedRecentDownloads.toLocaleString()} recent estimate` : 'estimate unavailable'} · provider-global scope · no country storefront claim</div>
          <span>Open Google Play <ExternalLink size={13} /></span>
        </a>)}</div>
      </>}
    </section>
  </section>;
}

function AmazonFireHome() {
  return <section className="today-shell">
    <div className="today-heading"><div><div className="eyebrow">AMAZON APPSTORE · FIRE</div><h1>Research the Fire ecosystem explicitly.</h1><p>Amazon Appstore support for general Android devices ended in 2025; Fire tablets and Fire devices remain the relevant mobile target.</p></div></div>
    <section className="panel platform-research-empty">
      <h2>Assisted discovery for now</h2>
      <p>Radar does not currently have a stable official Amazon competitor-chart API. It therefore does not manufacture an Amazon ranking from Apple or Google data.</p>
      <div className="platform-capability-grid">
        <div className="platform-capability-card"><span className="capability-status assisted">Assisted</span><h3>Fire tablet opportunity check</h3><p>Use Amazon’s current Fire tablet/Appstore ecosystem as the distribution target, then bring candidate URLs/ASINs into Radar evidence workflows.</p></div>
        <div className="platform-capability-card"><span className="capability-status assisted">Manual evidence</span><h3>Candidate comparison</h3><p>Store pages, gameplay footage, review samples, and competitor relationships can still be captured without pretending a public Amazon chart feed exists.</p></div>
      </div>
      <div className="platform-research-actions"><a className="primary" href="https://www.amazon.com/Best-Sellers/zgbs" target="_blank" rel="noreferrer">Open Amazon Best Sellers <ExternalLink size={14} /></a><a href="https://developer.amazon.com/apps-and-games/fire-tablets" target="_blank" rel="noreferrer">Fire tablet developer context <ExternalLink size={14} /></a></div>
    </section>
  </section>;
}

function CrossPlatformHome() {
  return <section className="today-shell">
    <div className="today-heading"><div><div className="eyebrow">CROSS-PLATFORM · COVERAGE</div><h1>Compare evidence availability before comparing games.</h1><p>Cross-platform mode is a coverage overview, not a blended candidate feed.</p></div></div>
    <div className="platform-capability-grid">
      <div className="platform-capability-card"><span className="capability-status live">Live</span><h3>Apple App Store</h3><p>Official Games charts + Apple metadata across US, UK, Canada and Australia.</p></div>
      <div className="platform-capability-card"><span className="capability-status">Conditional</span><h3>Google Play</h3><p>AppBrain-powered Android discovery once configured; provider positions and estimates remain explicitly third-party.</p></div>
      <div className="platform-capability-card"><span className="capability-status assisted">Assisted</span><h3>Amazon Appstore · Fire</h3><p>No automated competitor chart integrated yet; Fire-specific research remains assisted/manual.</p></div>
    </div>
    <div className="platform-source-note"><strong>No blended feed:</strong> select Apple, Google Play, or Amazon Fire in the platform selector before viewing candidates. Cross-platform mode never presents Apple candidates as cross-platform evidence and never merges incomparable ranks or provider positions into one score.</div>
  </section>;
}

export function PlatformResearchHome({ scope, onAnalyze }: { scope: PlatformScope; onAnalyze: (appId: string) => void }) {
  return <>
    <PlatformContextPanel scope={scope} />
    {scope === 'apple' && <Today onAnalyze={onAnalyze} />}
    {scope === 'google_play' && <GooglePlayHome />}
    {scope === 'amazon_fire' && <AmazonFireHome />}
    {scope === 'cross' && <CrossPlatformHome />}
  </>;
}
