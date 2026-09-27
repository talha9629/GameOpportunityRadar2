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
        <div className="search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by game, publisher, or Android package" /><button disabled><Search size={16} /> {filtered.length} matches</button></div>
        <div className="deep-library-list">{filtered.slice(0, 30).map((entry) => <a key={entry.packageName} href={entry.storeUrl} target="_blank" rel="noreferrer" className="platform-capability-card">
          <div className="platform-context-head"><div><strong>#{entry.rank} {entry.name}</strong><p>{entry.publisher} · {entry.packageName}</p></div>{entry.iconUrl && <img src={entry.iconUrl} alt="" width="44" height="44" />}</div>
          <div className="market-strip">
            <span className="market-chip">Popularity rank <b>#{entry.rank}</b></span>
            {entry.observedDelta != null && <span className="market-chip">Δ vs prior observation <b>{entry.observedDelta > 0 ? `+${entry.observedDelta}` : entry.observedDelta}</b>{entry.observationGapDays != null ? ` / ${entry.observationGapDays}d gap` : ''}</span>}
            <span className="market-chip">Snapshots <b>{entry.observations}</b></span>
          </div>
          <div className="platform-source-note">Rank: third-party public · Downloads: {entry.estimatedRecentDownloads != null ? `${entry.estimatedRecentDownloads.toLocaleString()} recent estimate` : 'estimate unavailable'} · no country storefront claim</div>
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

function CrossPlatformHome({ onAnalyze }: { onAnalyze: (appId: string) => void }) {
  const [google, setGoogle] = useState<GooglePlayRadar | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    void loadGooglePlayRadar()
      .then(setGoogle)
      .catch((err) => setGoogleError(err instanceof Error ? err.message : 'Google Play status unavailable.'));
  }, []);

  const googleStatus = google?.status ?? (googleError ? 'failed' : 'loading');
  const googleStatusClass = googleStatus === 'ok' ? 'live' : 'assisted';
  const googleCopy = googleStatus === 'ok'
    ? `${google.entries.length} Android candidates from AppBrain · last refresh ${new Date(google.generatedAt).toLocaleString()}.`
    : googleStatus === 'unconfigured'
      ? 'Automation ready, but APPBRAIN_API_KEY is not configured; 0 Android candidates are shown rather than Apple substitutes.'
      : googleStatus === 'failed'
        ? `Provider state failed${google?.error ? `: ${google.error}` : googleError ? `: ${googleError}` : '.'}`
        : 'Reading current Google Play automation state…';

  return <section className="today-shell">
    <div className="today-heading"><div><div className="eyebrow">CROSS-PLATFORM · RESEARCH</div><h1>Compare coverage before comparing games.</h1><p>Each platform keeps its own evidence quality and source boundaries.</p></div></div>
    <div className="platform-capability-grid">
      <div className="platform-capability-card"><span className="capability-status live">Live · 4 storefronts</span><h3>Apple App Store</h3><p>Official Games charts + Apple metadata across <strong>US, UK, Canada and Australia</strong>. Current exact history is kept per storefront.</p></div>
      <div className="platform-capability-card"><span className={`capability-status ${googleStatusClass}`}>{googleStatus}</span><h3>Google Play</h3><p>{googleCopy}</p></div>
      <div className="platform-capability-card"><span className="capability-status assisted">Assisted · Fire</span><h3>Amazon Appstore · Fire</h3><p>No automated competitor chart integrated yet; Fire-specific research remains assisted/manual and never borrows an Apple/Google rank.</p></div>
    </div>
    <div className="platform-source-note"><strong>Coverage is not equal across stores.</strong> Cross-platform mode never merges incomparable ranks into one score. Apple, Google Play, and Amazon evidence stay side-by-side until a comparable fact actually exists.</div>
    <Today onAnalyze={onAnalyze} />
  </section>;
}

export function PlatformResearchHome({ scope, onAnalyze }: { scope: PlatformScope; onAnalyze: (appId: string) => void }) {
  return <>
    <PlatformContextPanel scope={scope} />
    {scope === 'apple' && <Today onAnalyze={onAnalyze} />}
    {scope === 'google_play' && <GooglePlayHome />}
    {scope === 'amazon_fire' && <AmazonFireHome />}
    {scope === 'cross' && <CrossPlatformHome onAnalyze={onAnalyze} />}
  </>;
}
