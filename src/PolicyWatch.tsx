import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, FileDiff, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { listPolicyReviews, savePolicyReview } from './policyApi';
import {
  POLICY_DIMENSIONS,
  PolicyReviewStateSchema,
  PolicySeveritySchema,
  buildPolicyDiff,
  flattenPolicyChanges,
  loadPolicyIndex,
  loadPolicySnapshot,
  policyStabilityCounts,
  type PolicyAffectedDimension,
  type PolicyChange,
  type PolicyDiff,
  type PolicyIndex,
  type PolicyReview,
  type PolicyReviewState,
  type PolicySeverity,
  type PolicySource,
} from './policy';
import './policy.css';

type SelectedChange = { source: PolicySource; change: PolicyChange };

type Draft = {
  state: PolicyReviewState;
  severity: PolicySeverity | null;
  affectedDimensions: PolicyAffectedDimension[];
  notes: string;
};

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusLabel(status: PolicySource['fetchStatus']) {
  if (status === 'fresh') return 'Fresh';
  if (status === 'stale') return 'Last known good';
  return 'Unavailable';
}

function defaultDraft(review?: PolicyReview): Draft {
  return {
    state: review?.state ?? 'new_change',
    severity: review?.severity ?? null,
    affectedDimensions: review?.affectedDimensions ?? [],
    notes: review?.notes ?? '',
  };
}

export function PolicyWatch({ ownerEmail = null }: { ownerEmail?: string | null }) {
  const [index, setIndex] = useState<PolicyIndex | null>(null);
  const [reviews, setReviews] = useState<Record<string, PolicyReview>>({});
  const [selected, setSelected] = useState<SelectedChange | null>(null);
  const [diff, setDiff] = useState<PolicyDiff | null>(null);
  const [draft, setDraft] = useState<Draft>(defaultDraft());
  const [loading, setLoading] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const changes = useMemo(() => index ? flattenPolicyChanges(index) : [], [index]);
  const stability = useMemo(() => index ? policyStabilityCounts(index) : { confirmed: 0, pending: 0, legacyUnconfirmed: 0 }, [index]);
  const unreviewedCount = useMemo(() => changes.filter(({ change }) => {
    const review = reviews[change.id];
    return !review || review.state === 'new_change';
  }).length, [changes, reviews]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [nextIndex, nextReviews] = await Promise.all([
        loadPolicyIndex(),
        ownerEmail ? listPolicyReviews() : Promise.resolve([]),
      ]);
      setIndex(nextIndex);
      setReviews(Object.fromEntries(nextReviews.map((review) => [review.changeId, review])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Policy Watch could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [ownerEmail]);

  async function inspectChange(item: SelectedChange) {
    setSelected(item);
    setDraft(defaultDraft(reviews[item.change.id]));
    setDiff(null);
    setLoadingDiff(true);
    setError(null);
    setMessage(null);
    try {
      const [before, after] = await Promise.all([
        loadPolicySnapshot(item.change.fromPath),
        loadPolicySnapshot(item.change.toPath),
      ]);
      if (before.sourceId !== item.source.id || after.sourceId !== item.source.id) {
        throw new Error('Policy snapshot provenance does not match the selected source.');
      }
      setDiff(buildPolicyDiff(before.normalizedText, after.normalizedText));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the policy diff.');
    } finally {
      setLoadingDiff(false);
    }
  }

  function toggleDimension(dimension: PolicyAffectedDimension) {
    setDraft((current) => ({
      ...current,
      affectedDimensions: current.affectedDimensions.includes(dimension)
        ? current.affectedDimensions.filter((item) => item !== dimension)
        : [...current.affectedDimensions, dimension],
    }));
  }

  async function saveReview() {
    if (!selected || !ownerEmail) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const state = PolicyReviewStateSchema.parse(draft.state);
      const severity = draft.severity ? PolicySeveritySchema.parse(draft.severity) : null;
      const saved = await savePolicyReview({
        changeId: selected.change.id,
        sourceId: selected.source.id,
        state,
        severity,
        affectedDimensions: draft.affectedDimensions,
        notes: draft.notes,
      });
      setReviews((current) => ({ ...current, [saved.changeId]: saved }));
      setDraft(defaultDraft(saved));
      setMessage('Policy review saved to the owner workspace.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this policy review.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="policy-shell">
    <header className="policy-heading">
      <div>
        <div className="eyebrow">POLICY WATCH · OFFICIAL SOURCES ONLY</div>
        <h1>See what changed before policy risk reaches a prototype.</h1>
        <p>Radar snapshots official Apple and Google policy pages, hashes normalized text, and only promotes a changed hash after the same content is observed again at least 60 minutes later.</p>
      </div>
      <button disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} /> Refresh evidence</button>
    </header>

    <div className="policy-guardrail"><ShieldCheck size={18} /><div><strong>No legal-AI shortcut</strong><span>Policy Watch does not decide compliance or infer legal impact. Only a stability-confirmed change can enter the review queue; relevance and severity remain owner decisions.</span></div></div>

    {error && <div className="error-box">{error}</div>}
    {message && <div className="policy-success"><CheckCircle2 size={17} /> {message}</div>}

    {loading ? <section className="panel"><p>Loading policy evidence…</p></section> : index && <>
      <section className="policy-kpis">
        <div className="panel kpi"><span>Collector</span><strong className="method-kpi">{humanize(index.runStatus)}</strong><small>{index.freshCount}/{index.sourceCount} fresh</small></div>
        <div className="panel kpi"><span>Official sources</span><strong>{index.sourceCount}</strong><small>Apple + Google</small></div>
        <div className="panel kpi"><span>Confirmed changes</span><strong>{stability.confirmed}</strong><small>repeat-observed ≥60m</small></div>
        <div className="panel kpi"><span>Pending stability</span><strong>{stability.pending}</strong><small>not reviewable yet</small></div>
        <div className="panel kpi"><span>Needs review</span><strong>{unreviewedCount}</strong><small>confirmed owner queue</small></div>
      </section>

      {stability.legacyUnconfirmed > 0 && <div className="policy-warning"><Clock3 size={18} /><div><strong>{stability.legacyUnconfirmed} setup-era transition{stability.legacyUnconfirmed === 1 ? '' : 's'} quarantined</strong><span>These were detected before stability confirmation existed. They remain in immutable history but are excluded from the review queue and cannot trigger impact classification.</span></div></div>}

      {index.runStatus !== 'complete' && <div className="policy-warning"><AlertTriangle size={18} /><div><strong>Partial policy collection</strong><span>Failed sources keep their last-known-good snapshot. Radar does not fabricate a fresh policy state.</span></div></div>}

      <section className="panel policy-sources-panel">
        <div className="section-heading"><div><h2>Source health</h2><p>Critical policy pages monitored by the scheduled GitHub collector.</p></div><span>{index.generatedAt ? new Date(index.generatedAt).toLocaleString() : 'Not collected'}</span></div>
        <div className="policy-source-list">{index.sources.map((source) => <article key={source.id} className={`policy-source ${source.fetchStatus}`}>
          <div><span className="policy-vendor">{source.vendor.toUpperCase()}</span><strong>{source.title}</strong><small>{source.category.replaceAll('_', ' ')} · {source.history.length} snapshot{source.history.length === 1 ? '' : 's'}</small></div>
          <div className="policy-source-state"><b>{statusLabel(source.fetchStatus)}</b><small>{source.pendingCandidate ? `candidate ${source.pendingCandidate.hash.slice(0, 10)} · ${source.pendingCandidate.observations} observation(s)` : source.error ?? (source.current ? `stable hash ${source.current.hash.slice(0, 10)}` : 'No baseline yet')}</small></div>
          <a href={source.url} target="_blank" rel="noreferrer" aria-label={`Open ${source.title}`}><ExternalLink size={16} /></a>
        </article>)}</div>
      </section>

      <section className="panel policy-changes-panel">
        <div className="section-heading"><div><h2>Stability-confirmed changes</h2><p>A reviewable change requires the same changed normalized hash to be observed again at least 60 minutes later.</p></div><span>{changes.length} confirmed</span></div>
        {changes.length === 0 ? <div className="policy-empty"><FileDiff size={28} /><strong>No confirmed policy transition yet</strong><span>One-off or setup-era hash changes are deliberately excluded. Stable future transitions will appear here after confirmation.</span></div> : <div className="policy-change-list">{changes.map((item) => {
          const review = reviews[item.change.id];
          return <button key={item.change.id} className={selected?.change.id === item.change.id ? 'selected' : ''} onClick={() => void inspectChange(item)}>
            <span><b>{item.source.vendor.toUpperCase()}</b><strong>{item.source.title}</strong><small>Confirmed {new Date(item.change.confirmedAt ?? item.change.detectedAt).toLocaleString()}</small></span>
            <span><strong>{review ? humanize(review.state) : 'New change'}</strong><small>{review?.severity ? humanize(review.severity) : 'Severity unassessed'}</small></span>
          </button>;
        })}</div>}
      </section>

      {selected && <section className="policy-review-grid">
        <article className="panel policy-diff-panel">
          <div className="section-heading"><div><h2>Raw normalized diff</h2><p>{selected.source.title}</p></div><a href={selected.source.url} target="_blank" rel="noreferrer">Official page <ExternalLink size={14} /></a></div>
          {loadingDiff ? <p>Loading immutable snapshots…</p> : diff ? <>
            <div className="diff-context">Unchanged prefix: {diff.commonPrefixLines} lines · unchanged suffix: {diff.commonSuffixLines} lines</div>
            <div className="diff-columns">
              <div><h3>Removed / previous</h3><pre>{diff.removed.length ? diff.removed.map((line) => `- ${line}`).join('\n') : 'No removed lines in the changed window.'}</pre></div>
              <div><h3>Added / current</h3><pre>{diff.added.length ? diff.added.map((line) => `+ ${line}`).join('\n') : 'No added lines in the changed window.'}</pre></div>
            </div>
          </> : <p>No diff loaded.</p>}
        </article>

        <article className="panel policy-review-panel">
          <div className="eyebrow">OWNER REVIEW</div>
          <h2>Classify impact without hiding uncertainty.</h2>
          <label><span>Lifecycle state</span><select value={draft.state} onChange={(event) => setDraft((current) => ({ ...current, state: PolicyReviewStateSchema.parse(event.target.value) }))}>
            {PolicyReviewStateSchema.options.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
          </select></label>
          <label><span>Severity</span><select value={draft.severity ?? ''} onChange={(event) => setDraft((current) => ({ ...current, severity: event.target.value ? PolicySeveritySchema.parse(event.target.value) : null }))}>
            <option value="">Unassessed</option>
            {PolicySeveritySchema.options.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
          </select></label>
          <fieldset><legend>Affected decision dimensions</legend><div className="policy-dimension-grid">{POLICY_DIMENSIONS.map((dimension) => <label key={dimension.key}><input type="checkbox" checked={draft.affectedDimensions.includes(dimension.key)} onChange={() => toggleDimension(dimension.key)} /><span>{dimension.label}</span></label>)}</div></fieldset>
          <label><span>Review notes</span><textarea maxLength={4000} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="What changed, why it might matter, and what needs follow-up?" /></label>
          <button className="primary" disabled={!ownerEmail || saving} onClick={() => void saveReview()}><Save size={16} /> {saving ? 'Saving…' : ownerEmail ? 'Save review' : 'Sign in to save'}</button>
          {!ownerEmail && <small>Evidence remains public; review state is owner-only.</small>}
        </article>
      </section>}
    </>}
  </section>;
}
