import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudUpload, ExternalLink, Search, ShieldQuestion, XCircle } from 'lucide-react';
import { analyzeGame, isDirectAppleInput, loadSavedDossier, saveDossier, searchGameCandidates } from './api';
import { deriveDossierStatusSummary, type DossierNextTarget, type DossierStatusSummary } from './analyzeSummary';
import type { AnalysisResult, Finding, ReviewState, StoreCandidate } from './domain';
import { decideOpportunity, type Scorecard, type ScoreDimension, type ScoreValue } from './decision';
import { EvidenceLegend } from './EvidenceLegend';
import { hasSupabaseConfig } from './lib/supabase';
import './analyze-summary.css';
import './candidate.css';
import './cloud-save.css';
import './provenance.css';

const dimensionMeta: Record<ScoreDimension, { label: string; help: string }> = {
  momentum: { label: 'Momentum', help: 'Needs chart history, velocity and cross-market persistence.' },
  soloFit: { label: 'Solo Fit', help: 'How realistic is the scoped product for one Unity developer?' },
  differentiation: { label: 'Differentiation Room', help: 'Needs competitor mapping and meaningful product differences.' },
  saturation: { label: 'Saturation', help: 'Needs competitor density and cluster maturity evidence.' },
  risk: { label: 'Risk', help: 'Store/IP/policy, backend, content and production risk.' },
  confidence: { label: 'Confidence', help: 'How complete and reliable is the evidence behind this decision?' },
};

const initialScorecard = (): Scorecard => ({ momentum: null, soloFit: null, differentiation: null, saturation: null, risk: null, confidence: 2, hardBlocks: [] });

function ReviewBadge({ state }: { state: ReviewState }) {
  const labels: Record<ReviewState, string> = { unreviewed: 'Unreviewed', human_confirmed: 'Human confirmed', human_rejected: 'Human rejected', needs_more_evidence: 'Needs more evidence' };
  return <span className={`badge badge-${state}`}>{labels[state]}</span>;
}

function FindingCard({ finding, onReview }: { finding: Finding; onReview: (id: string, state: ReviewState) => void }) {
  return <article className="finding-card"><div className="finding-topline"><strong>{finding.label}</strong><ReviewBadge state={finding.reviewState} /></div><div className="finding-value">{finding.value}</div><div className="finding-meta"><span>{finding.coverage}</span><span>{finding.interpretation}</span><span>{finding.origin}</span><span>{Math.round(finding.confidence * 100)}% confidence</span></div><div className="evidence-line">Evidence: {finding.evidenceLabel}</div><div className="review-actions"><button onClick={() => onReview(finding.id, 'human_confirmed')}><CheckCircle2 size={16} /> Confirm</button><button onClick={() => onReview(finding.id, 'needs_more_evidence')}><ShieldQuestion size={16} /> Need evidence</button><button onClick={() => onReview(finding.id, 'human_rejected')}><XCircle size={16} /> Reject</button></div></article>;
}

function ScorePicker({ dimension, value, onChange }: { dimension: ScoreDimension; value: ScoreValue; onChange: (value: ScoreValue) => void }) {
  const meta = dimensionMeta[dimension];
  return <div className="score-row"><div><strong>{meta.label}</strong><span>{meta.help}</span></div><select value={value ?? ''} onChange={(event) => onChange(event.target.value ? Number(event.target.value) as ScoreValue : null)}><option value="">Unknown</option><option value="1">1 — Very low</option><option value="2">2 — Low</option><option value="3">3 — Moderate</option><option value="4">4 — High</option><option value="5">5 — Very high</option></select></div>;
}

function CandidatePicker({ query, candidates, onChoose, busy }: { query: string; candidates: StoreCandidate[]; onChoose: (candidate: StoreCandidate) => void; busy: boolean }) {
  return <section className="panel candidate-panel"><div><div className="eyebrow">IDENTITY CHECK</div><h3>Choose the exact App Store title</h3><p>Radar found multiple candidates for “{query}”. Nothing is analyzed until you choose the intended game.</p></div><div className="candidate-grid">{candidates.map((candidate) => <button key={candidate.storeId} className="candidate-card" disabled={busy} onClick={() => onChoose(candidate)}>{candidate.iconUrl && <img src={candidate.iconUrl} alt="" />}<span><strong>{candidate.canonicalName}</strong><small>{candidate.publisher ?? 'Publisher unknown'}</small><small>Apple ID {candidate.storeId}</small></span></button>)}</div></section>;
}

function SourceProvenance({ result }: { result: AnalysisResult }) {
  const observed = result.sourceObservedAt ? new Date(result.sourceObservedAt).toLocaleString() : null;
  return <section className="panel provenance-panel"><div className="provenance-head"><div><div className="eyebrow">SOURCE PROVENANCE</div><h3>Apple source record</h3><p>{observed ? `Fetched from Apple at ${observed}.` : 'Historical snapshot: exact fetch timestamp was not captured in this older dossier.'}</p></div><div className="provenance-status"><CheckCircle2 size={16} /> {result.rawSource ? 'Raw response captured' : 'Normalized snapshot only'}</div></div><p className="provenance-note">Radar keeps the original public store response separate from normalized findings so later audits can distinguish source evidence from interpretation.</p>{result.rawSource ? <details className="provenance-details"><summary>Inspect raw public Apple record</summary><pre>{JSON.stringify(result.rawSource, null, 2)}</pre></details> : <div className="principle-box"><strong>Historical compatibility</strong><p>This saved run predates raw-source preservation. It remains readable, but its normalized dossier should not be treated as equivalent to a newly captured raw observation.</p></div>}</section>;
}

function DossierStatusPanel({ summary, onNext }: { summary: DossierStatusSummary; onNext: (target: DossierNextTarget) => void }) {
  const cards = [
    { key: 'Source', ...summary.source },
    { key: 'Review', ...summary.review },
    { key: 'Unknowns', ...summary.unknowns },
    { key: 'Decision', ...summary.decision },
  ];

  return <section className="panel dossier-status-panel">
    <div className="dossier-status-heading"><div><div className="eyebrow">DOSSIER STATUS</div><h3>What is known, what is missing, what to do next</h3><p>This is workflow guidance from the current evidence state, not an opportunity rating.</p></div></div>
    <div className="dossier-status-grid">{cards.map((card) => <div key={card.key} className={`dossier-status-card ${card.complete ? 'is-complete' : 'is-pending'}`}><small>{card.key}</small><strong>{card.label}</strong><span>{card.detail}</span></div>)}</div>
    <div className="dossier-next-step" aria-live="polite"><div><div className="eyebrow">NEXT ACTION</div><strong>{summary.nextAction.label}</strong><p>{summary.nextAction.detail}</p></div><button className="primary" onClick={() => onNext(summary.nextAction.target)}>{summary.nextAction.label}</button></div>
  </section>;
}

export function Analyze({ initialInput = '', initialRunId = null, ownerEmail = null }: { initialInput?: string; initialRunId?: string | null; ownerEmail?: string | null }) {
  const [input, setInput] = useState(initialInput);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [candidates, setCandidates] = useState<StoreCandidate[]>([]);
  const [candidateQuery, setCandidateQuery] = useState('');
  const [scorecard, setScorecard] = useState<Scorecard>(initialScorecard);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [restoredRunId, setRestoredRunId] = useState<string | null>(null);
  const reviewedCount = useMemo(() => result?.findings.filter((finding) => finding.reviewState !== 'unreviewed').length ?? 0, [result]);
  const decision = useMemo(() => decideOpportunity(scorecard), [scorecard]);
  const dossierSummary = useMemo(() => result ? deriveDossierStatusSummary({
    rawSourceCaptured: Boolean(result.rawSource),
    findingCount: result.findings.length,
    reviewedCount,
    unknownCount: result.unknowns.length,
    decision,
  }) : null, [decision, result, reviewedCount]);

  async function runAnalysis(value: string) {
    setBusy(true); setError(null); setCandidates([]); setSaveMessage(null); setRestoredRunId(null);
    try { const next = await analyzeGame(value); setResult(next); setScorecard(initialScorecard()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Analysis failed.'); }
    finally { setBusy(false); }
  }

  async function restoreSavedRun(runId: string) {
    setBusy(true); setError(null); setCandidates([]); setSaveMessage(null);
    try {
      const saved = await loadSavedDossier(runId);
      setResult(saved.dossier);
      setScorecard(saved.scorecard);
      setInput(saved.dossier.game.storeId);
      setRestoredRunId(saved.runId);
      setSaveMessage(`Restored cloud snapshot · run ${saved.runId.slice(0, 8)}`);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Could not restore saved dossier.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialRunId) {
      void restoreSavedRun(initialRunId);
      return;
    }
    if (!initialInput) return;
    setInput(initialInput);
    void runAnalysis(initialInput);
  }, [initialInput, initialRunId]);

  async function submit() {
    const value = input.trim();
    setError(null); setResult(null); setCandidates([]); setSaveMessage(null); setRestoredRunId(null);
    if (isDirectAppleInput(value)) { await runAnalysis(value); return; }
    setBusy(true);
    try {
      const search = await searchGameCandidates(value);
      setCandidateQuery(search.query);
      setCandidates(search.candidates);
    } catch (err) { setError(err instanceof Error ? err.message : 'Search failed.'); }
    finally { setBusy(false); }
  }

  async function saveCurrentDossier() {
    if (!result) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const runId = await saveDossier(result, scorecard, decision);
      setRestoredRunId(runId);
      setSaveMessage(`Saved to cloud · run ${runId.slice(0, 8)}`);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Could not save dossier.');
    } finally {
      setSaving(false);
    }
  }

  function reviewFinding(id: string, state: ReviewState) { setSaveMessage(null); setResult((current) => current ? { ...current, findings: current.findings.map((finding) => finding.id === id ? { ...finding, reviewState: state } : finding) } : current); }
  function setScore(dimension: ScoreDimension, value: ScoreValue) { setSaveMessage(null); setScorecard((current) => ({ ...current, [dimension]: value })); }
  function toggleBlock(block: string) { setSaveMessage(null); setScorecard((current) => ({ ...current, hardBlocks: current.hardBlocks.includes(block) ? current.hardBlocks.filter((item) => item !== block) : [...current.hardBlocks, block] })); }
  function scrollToDossierTarget(target: DossierNextTarget) {
    const ids: Record<DossierNextTarget, string> = { findings: 'dossier-findings', unknowns: 'dossier-unknowns', scorecard: 'dossier-scorecard' };
    document.getElementById(ids[target])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return <section className="analyze-view">
    <header className="hero"><div><div className="eyebrow">{restoredRunId ? 'SAVED DOSSIER' : 'ANALYZE A GAME'}</div><h1>Evidence first. Decision second.</h1><p>{restoredRunId ? `Restored exact cloud run ${restoredRunId.slice(0, 8)}. Changes remain local until you save another snapshot.` : 'Facts, publisher claims, uncertainty and human judgment stay visibly separate.'}</p></div><div className={`connection-card ${hasSupabaseConfig ? 'ok' : 'warn'}`}>{hasSupabaseConfig ? <CheckCircle2 /> : <AlertTriangle />}<div><strong>{ownerEmail ? 'Owner cloud session active' : hasSupabaseConfig ? 'Public preview online' : 'Cloud setup required'}</strong><span>{ownerEmail ? `Saving is available for ${ownerEmail}.` : hasSupabaseConfig ? 'Analysis works without sign-in. Sign in only when you want cross-device saving.' : 'Supabase environment variables missing.'}</span></div></div></header>
    <section className="panel analyze-panel"><div><h2>Analyze a Game</h2><p>Paste an App Store URL or numeric Apple ID for direct analysis, or search by title and explicitly choose the exact match. Android stays assisted until an approved Android source is integrated.</p></div><div className="search-row"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !busy && input.trim().length >= 2) void submit(); }} placeholder="App Store URL, Apple ID, or game title" /><button className="primary" disabled={busy || input.trim().length < 2} onClick={submit}><Search size={18} /> {busy ? 'Working…' : 'Analyze'}</button></div>{error && <div className="error-box">{error}</div>}</section>
    {candidates.length > 0 && <CandidatePicker query={candidateQuery} candidates={candidates} busy={busy} onChoose={(candidate) => void runAnalysis(candidate.storeId)} />}
    {!result && candidates.length === 0 && !busy && <section className="empty-state panel"><h3>Start with one exact title</h3><p>Radar will separate source facts, listing claims, unknowns, and your review before asking you to make a preliminary decision.</p></section>}
    {busy && !result && <section className="empty-state panel"><h3>{initialRunId ? 'Restoring saved dossier…' : 'Building dossier…'}</h3><p>Radar is validating the requested evidence state before rendering it.</p></section>}
    {result && dossierSummary && <>
      <section className="game-header panel">{result.game.iconUrl && <img src={result.game.iconUrl} alt="" />}<div className="game-heading"><div className="eyebrow">{result.game.platform.toUpperCase()} · {restoredRunId ? 'SAVED SNAPSHOT' : result.sourceMode.toUpperCase()}</div><h2>{result.game.canonicalName}</h2><p>{result.game.publisher ?? 'Publisher unknown'}</p><a href={result.game.storeUrl} target="_blank" rel="noreferrer">Store page <ExternalLink size={14} /></a></div></section>
      <DossierStatusPanel summary={dossierSummary} onNext={scrollToDossierTarget} />
      <EvidenceLegend mode="analysis" />
      <section className="evidence-preview panel"><div><h3>Store evidence</h3><p>{result.game.description ? `${result.game.description.slice(0, 700)}${result.game.description.length > 700 ? '…' : ''}` : 'No store description returned.'}</p></div>{result.game.screenshots.length > 0 && <div className="screenshot-strip">{result.game.screenshots.slice(0, 6).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="App Store screenshot evidence" /></a>)}</div>}</section>
      <SourceProvenance result={result} />
      <section className="two-column"><div id="dossier-findings" className="panel"><h3>Evidence-backed findings</h3><div className="finding-grid">{result.findings.map((finding) => <FindingCard key={finding.id} finding={finding} onReview={reviewFinding} />)}</div></div><aside id="dossier-unknowns" className="panel unknown-panel"><h3>Unknown / not yet verified</h3><ul>{result.unknowns.map((item) => <li key={item}>{item}</li>)}</ul><div className="principle-box"><strong>Radar rule</strong><p>Listing evidence can support publisher claims. It cannot prove gameplay behavior, market momentum or differentiation.</p></div></aside></section>
      <section id="dossier-scorecard" className="panel scorecard-panel"><div className="scorecard-heading"><div><div className="eyebrow">PRELIMINARY DECISION</div><h2>Opportunity Scorecard</h2><p>{restoredRunId ? 'These values were restored from the saved run. Change them only when new evidence justifies it.' : 'Confidence starts at 2 because the current dossier is listing-only. Change a score only when you have evidence for it.'}</p></div><div className={`decision-chip decision-${decision.status.toLowerCase().replace(' ', '-')}`}><strong>{decision.status}</strong><span>{decision.reasons[0]}</span></div></div><div className="score-grid">{(Object.keys(dimensionMeta) as ScoreDimension[]).map((dimension) => <ScorePicker key={dimension} dimension={dimension} value={scorecard[dimension]} onChange={(value) => setScore(dimension, value)} />)}</div>{decision.missing.length > 0 && <div className="missing-evidence"><strong>Still missing:</strong> {decision.missing.map((key) => dimensionMeta[key].label).join(', ')}</div>}<div className="hard-blocks"><strong>Hard blockers</strong><p>Any active hard blocker forces PASS regardless of numeric scores.</p>{['IP / trademark imitation risk', 'Backend / multiplayer / content scope is unrealistic', 'Material legal or store-policy issue'].map((block) => <label key={block}><input type="checkbox" checked={scorecard.hardBlocks.includes(block)} onChange={() => toggleBlock(block)} /> {block}</label>)}</div><div className="decision-rule-note"><strong>Prototype threshold:</strong> Momentum ≥4 · Solo Fit ≥4 · Differentiation ≥3 · Risk ≤2 · Confidence ≥3 · no hard blockers. BUILD NOW remains unavailable until an internal prototype is validated.</div></section>
      <section className="panel cloud-save-panel"><div><div className="eyebrow">CROSS-DEVICE STATE</div><h3>{ownerEmail ? (restoredRunId ? 'Save current state as a new cloud snapshot' : 'Save this dossier to your cloud workspace') : 'Sign in as the owner to save'}</h3><p>{ownerEmail ? 'The current reviews, evidence snapshot, analysis run and scorecard are committed together as one database transaction.' : 'Analysis stays available publicly, but anonymous sessions cannot write to the Radar database.'}</p>{saveMessage && <div className="save-message">{saveMessage}</div>}</div><button className="primary" disabled={!ownerEmail || saving} onClick={() => void saveCurrentDossier()}><CloudUpload size={18} /> {saving ? 'Saving…' : 'Save dossier'}</button></section>
    </>}
  </section>;
}
