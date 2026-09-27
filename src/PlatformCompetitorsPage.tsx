import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Plus, Search, Trash2 } from 'lucide-react';
import { Competitors } from './Competitors';
import { relationshipTypes, type RelationshipType } from './competitor';
import { loadGooglePlayRadar, type GooglePlayEntry, type GooglePlayRadar } from './googlePlayRadar';
import { PlatformContextPanel } from './PlatformContextPanel';
import type { PlatformScope } from './platformScope';

interface AndroidComparison {
  entry: GooglePlayEntry;
  relationship: RelationshipType;
}

function AndroidIdentity({ entry, label }: { entry: GooglePlayEntry; label: string }) {
  return <div className="comparison-identity">
    {entry.iconUrl && <img src={entry.iconUrl} alt="" />}
    <div><span>{label}</span><strong>{entry.name}</strong><small>{entry.publisher} · {entry.packageName}</small></div>
    <a href={entry.storeUrl} target="_blank" rel="noreferrer" aria-label={`Open ${entry.name} on Google Play`}><ExternalLink size={14} /><span>Google Play</span></a>
  </div>;
}

function AndroidFacts({ entry }: { entry: GooglePlayEntry }) {
  return <div className="market-strip">
    <span className="market-chip">AppBrain position <b>#{entry.rank}</b></span>
    <span className="market-chip">Rating <b>{entry.rating?.toFixed(2) ?? '—'}</b></span>
    <span className="market-chip">Ratings <b>{entry.ratingCount?.toLocaleString() ?? '—'}</b></span>
    <span className="market-chip">Recent downloads <b>{entry.estimatedRecentDownloads?.toLocaleString() ?? '—'} est.</b></span>
    <span className="market-chip">Snapshots <b>{entry.observations}</b></span>
  </div>;
}

function GooglePlayCompetitors() {
  const [data, setData] = useState<GooglePlayRadar | null>(null);
  const [primary, setPrimary] = useState<GooglePlayEntry | null>(null);
  const [query, setQuery] = useState('');
  const [comparisons, setComparisons] = useState<AndroidComparison[]>([]);
  const [relationship, setRelationship] = useState<RelationshipType>('DIRECT_COMPETITOR');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadGooglePlayRadar().then(setData).catch((err) => setError(err instanceof Error ? err.message : 'Could not load Google Play research data.'));
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return (data?.entries ?? []).filter((entry) => {
      if (primary?.packageName === entry.packageName) return false;
      if (comparisons.some((item) => item.entry.packageName === entry.packageName)) return false;
      if (!value) return true;
      return `${entry.name} ${entry.publisher} ${entry.packageName}`.toLowerCase().includes(value);
    });
  }, [comparisons, data, primary, query]);

  if (data?.status !== 'ok') {
    return <section className="panel platform-research-empty">
      <div className="eyebrow">GOOGLE PLAY · COMPETITORS</div>
      <h1>Android competitor mapping needs the Android provider feed.</h1>
      <p>{data?.status === 'unconfigured'
        ? 'APPBRAIN_API_KEY is not configured, so Radar will not populate Google Play competitors from Apple titles.'
        : data?.status === 'failed'
          ? `The AppBrain collection failed: ${data.error}`
          : 'Loading Google Play market intelligence…'}</p>
      {error && <div className="error-box">{error}</div>}
    </section>;
  }

  return <section className="competitors-view">
    <header className="compact-hero"><div className="eyebrow">GOOGLE PLAY · COMPETITOR MAP</div><h1>Compare Android titles inside one evidence universe.</h1><p>Candidate discovery comes only from the Google Play/AppBrain feed. Relationship labels remain human judgments; AppBrain download values remain estimates.</p></header>

    <section className="panel competitor-setup">
      <div><h2>1. Choose primary Android game</h2><p>Select from the current provider-backed Google Play discovery feed.</p></div>
      {!primary && <div className="deep-library-list">{data.entries.slice(0, 20).map((entry) => <button key={entry.packageName} onClick={() => { setPrimary(entry); setComparisons([]); }}><span><strong>#{entry.rank} {entry.name}</strong><small>{entry.publisher} · {entry.packageName}</small></span></button>)}</div>}
      {primary && <><AndroidIdentity entry={primary} label="Primary · Google Play" /><AndroidFacts entry={primary} /><button onClick={() => { setPrimary(null); setComparisons([]); }}>Change primary</button></>}
    </section>

    {primary && <>
      <section className="panel competitor-setup">
        <div><h2>2. Find same-platform candidates</h2><p>Search only within the current Google Play discovery feed. No Apple candidate is mixed into this map.</p></div>
        <div className="search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Android game, publisher, or package" /><button disabled><Search size={16} /> {filtered.length}</button></div>
        <div className="relationship-control"><label>Relationship for next candidate</label><select value={relationship} onChange={(event) => setRelationship(event.target.value as RelationshipType)}>{relationshipTypes.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></div>
        <div className="deep-library-list">{filtered.slice(0, 20).map((entry) => <button key={entry.packageName} onClick={() => setComparisons((current) => [...current, { entry, relationship }])}><span><strong>#{entry.rank} {entry.name}</strong><small>{entry.publisher}</small></span><Plus size={15} /></button>)}</div>
      </section>

      <section className="panel"><div className="eyebrow">HUMAN-CONFIRMED WORKING MAP</div><h2>{comparisons.length} Android relationship{comparisons.length === 1 ? '' : 's'}</h2><p>This V1 Google Play map is a live research workspace; cloud persistence/differentiation matrices remain Apple-only until the non-Apple canonical store schema is added.</p></section>

      {comparisons.map((item) => <section className="panel competitor-card" key={item.entry.packageName}>
        <div className="competitor-card-head"><AndroidIdentity entry={item.entry} label="Compared title · Google Play" /><div className="relationship-control"><label>Relationship</label><select value={item.relationship} onChange={(event) => setComparisons((current) => current.map((candidate) => candidate.entry.packageName === item.entry.packageName ? { ...candidate, relationship: event.target.value as RelationshipType } : candidate))}>{relationshipTypes.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></div><button className="danger-quiet" onClick={() => setComparisons((current) => current.filter((candidate) => candidate.entry.packageName !== item.entry.packageName))}><Trash2 size={14} /> Remove</button></div>
        <AndroidFacts entry={item.entry} />
        <div className="platform-source-note">Comparison facts shown here are same-provider Android evidence: AppBrain popularity position/rating from third-party market intelligence and downloads as third-party estimates. They are not official Google rankings or country-market claims.</div>
      </section>)}
    </>}
  </section>;
}

function AmazonCompetitors() {
  const [query, setQuery] = useState('');
  const searchUrl = query.trim()
    ? `https://www.amazon.com/s?k=${encodeURIComponent(query.trim())}&i=mobile-apps`
    : 'https://www.amazon.com/Best-Sellers/zgbs';
  return <section className="competitors-view">
    <header className="compact-hero"><div className="eyebrow">AMAZON APPSTORE · FIRE</div><h1>Keep Fire competitors in the Fire ecosystem.</h1><p>Radar has no stable automated Amazon competitor chart yet, so it will not substitute Apple or Google candidates.</p></header>
    <section className="panel platform-research-empty"><h2>Assisted competitor discovery</h2><div className="search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Fire game title, publisher, package, or ASIN" /><a className="primary" href={searchUrl} target="_blank" rel="noreferrer"><Search size={16} /> Search Amazon</a></div><div className="platform-source-note">Use Amazon listings as the candidate source, then capture review/gameplay evidence in Radar. Automated relationship persistence for Amazon will be added only when the canonical multi-store identity model exists.</div></section>
  </section>;
}

function CrossCompetitors() {
  return <section className="competitors-view"><section className="panel platform-research-empty"><div className="eyebrow">CROSS-PLATFORM · COMPETITORS</div><h1>Choose one store before mapping competitors.</h1><p>Apple rank, AppBrain Android popularity position, and Amazon Fire listing evidence are different evidence universes. Select a platform in the header first; Radar will not merge them into one competitor rank or winner.</p></section></section>;
}

export function PlatformCompetitorsPage({ scope, ownerEmail }: { scope: PlatformScope; ownerEmail: string | null }) {
  return <>
    <PlatformContextPanel scope={scope} />
    {scope === 'apple' && <Competitors ownerEmail={ownerEmail} />}
    {scope === 'google_play' && <GooglePlayCompetitors />}
    {scope === 'amazon_fire' && <AmazonCompetitors />}
    {scope === 'cross' && <CrossCompetitors />}
  </>;
}
