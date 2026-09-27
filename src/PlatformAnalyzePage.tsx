import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { Analyze } from './Analyze';
import { loadGooglePlayRadar, type GooglePlayRadar } from './googlePlayRadar';
import { PlatformContextPanel } from './PlatformContextPanel';
import type { PlatformScope } from './platformScope';

function GooglePlayAnalyze() {
  const [data, setData] = useState<GooglePlayRadar | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadGooglePlayRadar().then(setData).catch((err) => setError(err instanceof Error ? err.message : 'Could not load Google Play research data.'));
  }, []);

  const matches = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return data?.entries ?? [];
    return (data?.entries ?? []).filter((entry) => `${entry.name} ${entry.publisher} ${entry.packageName}`.toLowerCase().includes(value));
  }, [data, query]);

  return <section className="analyze-view">
    <section className="panel platform-research-empty">
      <div className="eyebrow">GOOGLE PLAY · ANALYZE</div>
      <h1>Research Android candidates without Apple fallback.</h1>
      <p>This mode uses the current Google Play/AppBrain discovery feed only. It does not send a Google Play query into the Apple analyzer.</p>
      {data?.status === 'unconfigured' && <div className="platform-source-note">APPBRAIN_API_KEY is not configured, so Google Play candidate analysis is intentionally unavailable. Add the key and the scheduled collector will populate this mode automatically.</div>}
      {data?.status === 'failed' && <div className="error-box">Google Play provider failed: {data.error}</div>}
      {error && <div className="error-box">{error}</div>}
      {data?.status === 'ok' && <>
        <div className="search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Game title, publisher, or Android package" /><button disabled><Search size={17} /> {matches.length}</button></div>
        <div className="deep-library-list">{matches.slice(0, 30).map((entry) => <article className="panel" key={entry.packageName}>
          <div className="platform-context-head"><div><div className="eyebrow">APPBRAIN · THIRD-PARTY</div><h3>#{entry.rank} {entry.name}</h3><p>{entry.publisher} · {entry.packageName}</p></div>{entry.iconUrl && <img src={entry.iconUrl} alt="" width="56" height="56" />}</div>
          <div className="market-strip"><span className="market-chip">Rating <b>{entry.rating?.toFixed(2) ?? '—'}</b></span><span className="market-chip">Ratings <b>{entry.ratingCount?.toLocaleString() ?? '—'}</b></span><span className="market-chip">Recent downloads <b>{entry.estimatedRecentDownloads?.toLocaleString() ?? '—'} est.</b></span><span className="market-chip">Observed <b>{entry.daysObserved}d</b></span></div>
          <div className="platform-source-note">Popularity/rating fields are AppBrain market intelligence. Download values are third-party estimates. This is not an official Google rank/download claim and is not country-specific.</div>
          <a href={entry.storeUrl} target="_blank" rel="noreferrer">Open Google Play <ExternalLink size={14} /></a>
        </article>)}</div>
      </>}
    </section>
  </section>;
}

function AmazonAnalyze() {
  const [query, setQuery] = useState('');
  const searchUrl = query.trim()
    ? `https://www.amazon.com/s?k=${encodeURIComponent(query.trim())}&i=mobile-apps`
    : 'https://www.amazon.com/Best-Sellers/zgbs';
  return <section className="analyze-view">
    <section className="panel platform-research-empty">
      <div className="eyebrow">AMAZON APPSTORE · FIRE</div>
      <h1>Research Fire candidates without Android-store confusion.</h1>
      <p>Amazon’s general Android-device Appstore distribution ended in 2025. Radar therefore treats Amazon as a Fire ecosystem target, not as another generic Android storefront.</p>
      <div className="search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Game title, publisher, package, or ASIN" /><a className="primary" href={searchUrl} target="_blank" rel="noreferrer"><Search size={17} /> Search Amazon</a></div>
      <div className="platform-source-note">Radar does not currently have a stable automated Amazon competitor-ranking source. Use the official/public Amazon listing as evidence, then use Review Samples, Competitors, and Deep Verify inside Radar. No Apple or Google rank is substituted.</div>
    </section>
  </section>;
}

function CrossAnalyze() {
  return <section className="analyze-view"><section className="panel platform-research-empty"><div className="eyebrow">CROSS-PLATFORM · ANALYZE</div><h1>Choose the store before analyzing.</h1><p>A cross-platform dossier must preserve separate store identities and evidence. Select Apple, Google Play, or Amazon Fire in the workspace header, then analyze that platform directly. Radar will not merge incomparable store ranks into one result.</p></section></section>;
}

export function PlatformAnalyzePage({
  scope,
  initialInput,
  initialRunId,
  ownerEmail,
}: {
  scope: PlatformScope;
  initialInput: string;
  initialRunId: string | null;
  ownerEmail: string | null;
}) {
  return <>
    <PlatformContextPanel scope={scope} />
    {scope === 'apple' && <Analyze key={initialRunId ?? initialInput ?? 'manual'} initialInput={initialInput} initialRunId={initialRunId} ownerEmail={ownerEmail} />}
    {scope === 'google_play' && <GooglePlayAnalyze />}
    {scope === 'amazon_fire' && <AmazonAnalyze />}
    {scope === 'cross' && <CrossAnalyze />}
  </>;
}
