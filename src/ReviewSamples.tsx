import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudUpload, RotateCcw, Search } from 'lucide-react';
import {
  listStorefrontReviewSamples,
  loadStorefrontReviewSample,
  saveStorefrontReviewSample,
} from './storefrontReviewApi';
import {
  analyzeReviewSample,
  type ReviewCluster,
  type ReviewEntry,
  type ReviewSampleAnalysis,
  type SavedReviewSummary,
} from './reviews';
import { STOREFRONT_META, type Storefront } from './storeIdentity';
import './reviews.css';

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function ClusterCard({ cluster, entries }: { cluster: ReviewCluster; entries: ReviewEntry[] }) {
  const evidence = cluster.evidenceSequences
    .map((sequence) => entries.find((entry) => entry.sequence === sequence))
    .filter((entry): entry is ReviewEntry => Boolean(entry));

  return <article className="review-cluster-card">
    <div className="review-cluster-top"><strong>{cluster.label}</strong><span>{percent(cluster.sampleShare)} of this sample</span></div>
    <div className="review-cluster-count">{cluster.reviewCount} / {entries.length} reviews</div>
    {evidence.length > 0 ? <details><summary>Inspect supporting reviews</summary><div className="review-evidence-list">{evidence.slice(0, 12).map((entry) => <div key={entry.sequence}><b>#{entry.sequence}{entry.rating ? ` · ${entry.rating}★` : ''}</b><span>{entry.text}</span></div>)}</div></details> : <p>No review in this sample matched this cluster.</p>}
  </article>;
}

function ReviewEntryCard({ entry }: { entry: ReviewEntry }) {
  return <div className="review-entry-card">
    <div className="review-entry-meta"><strong>#{entry.sequence}</strong><span>{entry.rating ? `${entry.rating}★` : 'No rating supplied'}</span></div>
    <p>{entry.text}</p>
    <div className="review-labels">{entry.labels.length ? entry.labels.map((label) => <span key={label}>{label.replaceAll('_', ' ')}</span>) : <span className="unclassified">No rule matched</span>}</div>
  </div>;
}

export function ReviewSamples({
  storefront,
  ownerEmail = null,
}: {
  storefront: Storefront;
  ownerEmail?: string | null;
}) {
  const storefrontMeta = STOREFRONT_META[storefront];
  const [label, setLabel] = useState('');
  const [storeId, setStoreId] = useState('');
  const [rawText, setRawText] = useState('');
  const [analysis, setAnalysis] = useState<ReviewSampleAnalysis | null>(null);
  const [saved, setSaved] = useState<SavedReviewSummary[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedClusters = useMemo(() => analysis
    ? [...analysis.clusters].sort((a, b) => b.reviewCount - a.reviewCount || a.label.localeCompare(b.label))
    : [], [analysis]);
  const unclassifiedCount = useMemo(() => analysis?.entries.filter((entry) => entry.labels.length === 0).length ?? 0, [analysis]);

  async function refreshSaved() {
    if (!ownerEmail) { setSaved([]); return; }
    try { setSaved(await listStorefrontReviewSamples(storefront)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load saved review samples.'); }
  }

  useEffect(() => {
    setLabel('');
    setStoreId('');
    setRawText('');
    setAnalysis(null);
    setSelectedSampleId(null);
    setMessage(null);
    setError(null);
  }, [storefront]);

  useEffect(() => {
    setSelectedSampleId(null);
    setMessage(null);
    setError(null);
    void refreshSaved();
  }, [ownerEmail, storefront]);

  function runAnalysis() {
    setError(null); setMessage(null); setSelectedSampleId(null);
    try {
      const next = analyzeReviewSample(rawText);
      setAnalysis(next);
      if (!label.trim()) setLabel(`${storefrontMeta.shortLabel} review sample · ${new Date().toLocaleDateString()}`);
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof Error ? err.message : 'Could not analyze this review sample.');
    }
  }

  async function saveCurrent() {
    if (!analysis) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const sampleId = await saveStorefrontReviewSample(storefront, label, storeId, analysis);
      setSelectedSampleId(sampleId);
      setMessage(`Saved ${storefrontMeta.shortLabel} review sample · ${sampleId.slice(0, 8)}`);
      await refreshSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this review sample.');
    } finally { setSaving(false); }
  }

  async function restoreSample(sampleId: string) {
    setBusy(true); setError(null); setMessage(null);
    try {
      const payload = await loadStorefrontReviewSample(storefront, sampleId);
      setSelectedSampleId(payload.sampleId);
      setLabel(payload.label);
      setStoreId(payload.storeId ?? '');
      setRawText(payload.entries.map((entry) => `${entry.rating ? `${entry.rating} | ` : ''}${entry.text}`).join('\n'));
      setAnalysis({ analysisMethod: 'keyword_rules_v1', entries: payload.entries, clusters: payload.clusters });
      setMessage(`Restored exact ${storefrontMeta.shortLabel} cloud sample · ${payload.sampleId.slice(0, 8)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore the saved review sample.');
    } finally { setBusy(false); }
  }

  function clearWorkspace() {
    setLabel(''); setStoreId(''); setRawText(''); setAnalysis(null); setSelectedSampleId(null); setError(null); setMessage(null);
  }

  const storePlaceholder = storefront === 'apple_app_store'
    ? '6761760135'
    : storefront === 'google_play'
      ? 'com.example.game'
      : 'Amazon app ID or Android package';

  return <section className="reviews-shell">
    <header className="reviews-heading">
      <div><div className="eyebrow">REVIEW SAMPLE ANALYZER · {storefrontMeta.label.toUpperCase()}</div><h1>Find pain points without pretending the sample is the market.</h1><p>Paste deliberately selected competitor reviews from {storefrontMeta.label}. Radar clusters only what you supplied and keeps the denominator and storefront provenance visible.</p></div>
      <button onClick={clearWorkspace}><RotateCcw size={16} /> New sample</button>
    </header>

    <div className="sample-rule-banner"><AlertTriangle size={18} /><div><strong>Sample rule</strong><span>“38%” here always means 38% of this pasted sample—not 38% of players, installs, reviewers, or the market.</span></div></div>

    <section className="panel review-input-panel">
      <div className="review-meta-fields">
        <label><span>Sample label</span><input value={label} maxLength={160} onChange={(event) => setLabel(event.target.value)} placeholder={`e.g. ${storefrontMeta.shortLabel} competitor negative reviews · Sep 27`} /></label>
        <label><span>{storefrontMeta.idLabel} / saved game link (optional)</span><input value={storeId} onChange={(event) => setStoreId(event.target.value)} placeholder={storePlaceholder} /></label>
      </div>
      <div className="platform-source-note"><strong>Storefront provenance:</strong> this sample will be saved as {storefrontMeta.label}. A saved sample is only shown and restorable inside the same storefront workspace.</div>
      <label className="review-text-field"><span>Reviews · one review per line</span><textarea value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder={'5 | Love the core puzzle, very relaxing\n1 | Too many ads after every level\n2 | Keeps crashing and I uninstalled it'} /></label>
      <div className="review-input-footer"><div><strong>Optional rating prefix:</strong> <code>5 | review text</code>. Maximum 500 reviews; each review is stored as supplied.</div><button className="primary" disabled={!rawText.trim() || busy} onClick={runAnalysis}><Search size={17} /> Analyze sample</button></div>
      {error && <div className="error-box">{error}</div>}
      {message && <div className="review-success"><CheckCircle2 size={17} /> {message}</div>}
    </section>

    {analysis && <>
      <section className="review-kpis">
        <div className="panel kpi"><span>Sample size</span><strong>{analysis.entries.length}</strong><small>manual evidence rows</small></div>
        <div className="panel kpi"><span>Method</span><strong className="method-kpi">Rules v1</strong><small>deterministic · not AI</small></div>
        <div className="panel kpi"><span>Unclassified</span><strong>{unclassifiedCount}</strong><small>{percent(unclassifiedCount / analysis.entries.length)} of this sample</small></div>
        <div className="panel kpi"><span>Cloud state</span><strong className="method-kpi">{selectedSampleId ? 'Saved' : 'Local'}</strong><small>{selectedSampleId ? selectedSampleId.slice(0, 8) : 'not persisted yet'}</small></div>
      </section>

      <div className="method-banner"><strong>How this analysis was produced</strong><span><code>keyword_rules_v1</code> is a transparent deterministic baseline. Reviews may appear in multiple clusters. It does not infer motives, hidden sentiment, or population-wide prevalence.</span></div>

      <section className="panel"><div className="section-heading"><div><h2>Clusters</h2><p>Sorted by count within this exact sample. Open a cluster to inspect the supporting review rows.</p></div><span>{analysis.entries.length} review denominator</span></div><div className="review-cluster-grid">{sortedClusters.map((cluster) => <ClusterCard key={cluster.clusterKey} cluster={cluster} entries={analysis.entries} />)}</div></section>

      <section className="panel review-entries-panel"><div className="section-heading"><div><h2>Sample evidence</h2><p>Original supplied text with rule labels. No review text is rewritten.</p></div><span>{analysis.entries.length} rows</span></div><div className="review-entry-list">{analysis.entries.map((entry) => <ReviewEntryCard key={entry.sequence} entry={entry} />)}</div></section>

      <section className="panel review-save-panel"><div><div className="eyebrow">CROSS-DEVICE STATE · {storefrontMeta.shortLabel.toUpperCase()}</div><h3>{ownerEmail ? 'Save this exact sample analysis' : 'Sign in as owner to save'}</h3><p>{ownerEmail ? `Saving is available for ${ownerEmail}. Entries, labels, cluster counts, evidence indexes and ${storefrontMeta.label} provenance are persisted atomically.` : 'Local analysis works without sign-in. Cloud persistence remains owner-only.'}</p></div><button className="primary" disabled={!ownerEmail || saving || !label.trim()} onClick={() => void saveCurrent()}><CloudUpload size={17} /> {saving ? 'Saving…' : 'Save sample'}</button></section>
    </>}

    {ownerEmail && <section className="panel saved-review-panel"><div className="section-heading"><div><h2>Saved {storefrontMeta.shortLabel} review samples</h2><p>Only {storefrontMeta.label} samples are listed here. Open an exact cloud snapshot to audit or continue from another device.</p></div><span>{saved.length} saved</span></div>{saved.length === 0 ? <p>No saved {storefrontMeta.shortLabel} review samples yet.</p> : <div className="saved-review-list">{saved.map((item) => <button key={item.sampleId} className={selectedSampleId === item.sampleId ? 'selected' : ''} disabled={busy} onClick={() => void restoreSample(item.sampleId)}><span><strong>{item.label}</strong><small>{item.canonicalName ?? (item.storeId ? `${storefrontMeta.idLabel} ${item.storeId}` : `Unlinked ${storefrontMeta.shortLabel} sample`)}</small></span><span><b>{item.entryCount}</b><small>reviews</small></span><span><small>{new Date(item.createdAt).toLocaleString()}</small></span></button>)}</div>}</section>}
  </section>;
}