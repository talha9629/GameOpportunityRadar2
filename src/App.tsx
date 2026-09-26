import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Search, ShieldQuestion, XCircle } from 'lucide-react';
import { analyzeGame } from './api';
import type { AnalysisResult, Finding, ReviewState } from './domain';
import { decideOpportunity, type Scorecard, type ScoreDimension, type ScoreValue } from './decision';
import { hasSupabaseConfig } from './lib/supabase';

const dimensionMeta: Record<ScoreDimension, { label: string; help: string }> = {
  momentum: { label: 'Momentum', help: 'Needs chart history, velocity and cross-market persistence.' },
  soloFit: { label: 'Solo Fit', help: 'How realistic is the scoped product for one Unity developer?' },
  differentiation: { label: 'Differentiation Room', help: 'Needs competitor mapping and meaningful product differences.' },
  saturation: { label: 'Saturation', help: 'Needs competitor density and cluster maturity evidence.' },
  risk: { label: 'Risk', help: 'Store/IP/policy, backend, content and production risk.' },
  confidence: { label: 'Confidence', help: 'How complete and reliable is the evidence behind this decision?' },
};

const initialScorecard = (): Scorecard => ({
  momentum: null,
  soloFit: null,
  differentiation: null,
  saturation: null,
  risk: null,
  confidence: 2,
  hardBlocks: [],
});

function ReviewBadge({ state }: { state: ReviewState }) {
  const labels: Record<ReviewState, string> = {
    unreviewed: 'Unreviewed',
    human_confirmed: 'Human confirmed',
    human_rejected: 'Human rejected',
    needs_more_evidence: 'Needs more evidence',
  };
  return <span className={`badge badge-${state}`}>{labels[state]}</span>;
}

function FindingCard({ finding, onReview }: { finding: Finding; onReview: (id: string, state: ReviewState) => void }) {
  return (
    <article className="finding-card">
      <div className="finding-topline"><strong>{finding.label}</strong><ReviewBadge state={finding.reviewState} /></div>
      <div className="finding-value">{finding.value}</div>
      <div className="finding-meta">
        <span>{finding.coverage}</span><span>{finding.interpretation}</span><span>{finding.origin}</span>
        <span>{Math.round(finding.confidence * 100)}% confidence</span>
      </div>
      <div className="evidence-line">Evidence: {finding.evidenceLabel}</div>
      <div className="review-actions">
        <button onClick={() => onReview(finding.id, 'human_confirmed')}><CheckCircle2 size={16} /> Confirm</button>
        <button onClick={() => onReview(finding.id, 'needs_more_evidence')}><ShieldQuestion size={16} /> Need evidence</button>
        <button onClick={() => onReview(finding.id, 'human_rejected')}><XCircle size={16} /> Reject</button>
      </div>
    </article>
  );
}

function ScorePicker({ dimension, value, onChange }: { dimension: ScoreDimension; value: ScoreValue; onChange: (value: ScoreValue) => void }) {
  const meta = dimensionMeta[dimension];
  return (
    <div className="score-row">
      <div><strong>{meta.label}</strong><span>{meta.help}</span></div>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value ? Number(event.target.value) as ScoreValue : null)}>
        <option value="">Unknown</option>
        <option value="1">1 — Very low</option><option value="2">2 — Low</option><option value="3">3 — Moderate</option>
        <option value="4">4 — High</option><option value="5">5 — Very high</option>
      </select>
    </div>
  );
}

export function App() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard>(initialScorecard);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reviewedCount = useMemo(() => result?.findings.filter((finding) => finding.reviewState !== 'unreviewed').length ?? 0, [result]);
  const decision = useMemo(() => decideOpportunity(scorecard), [scorecard]);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const next = await analyzeGame(input);
      setResult(next);
      setScorecard(initialScorecard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally { setBusy(false); }
  }

  function reviewFinding(id: string, state: ReviewState) {
    setResult((current) => current ? { ...current, findings: current.findings.map((finding) => finding.id === id ? { ...finding, reviewState: state } : finding) } : current);
  }

  function setScore(dimension: ScoreDimension, value: ScoreValue) {
    setScorecard((current) => ({ ...current, [dimension]: value }));
  }

  function toggleBlock(block: string) {
    setScorecard((current) => ({ ...current, hardBlocks: current.hardBlocks.includes(block) ? current.hardBlocks.filter((item) => item !== block) : [...current.hardBlocks, block] }));
  }

  return (
    <main className="page-shell">
      <header className="hero">
        <div><div className="eyebrow">GAME OPPORTUNITY RADAR 2.0</div><h1>Evidence first. Decision second.</h1><p>Facts, publisher claims, uncertainty and human judgment stay visibly separate.</p></div>
        <div className={`connection-card ${hasSupabaseConfig ? 'ok' : 'warn'}`}>
          {hasSupabaseConfig ? <CheckCircle2 /> : <AlertTriangle />}
          <div><strong>{hasSupabaseConfig ? 'Public preview online' : 'Cloud setup required'}</strong><span>{hasSupabaseConfig ? 'No sign-in required. Analysis is stateless for now.' : 'Supabase environment variables missing.'}</span></div>
        </div>
      </header>

      <section className="panel analyze-panel">
        <div><h2>Analyze a Game</h2><p>Paste an App Store URL or numeric Apple ID. Title search remains provisional; Android stays assisted until an approved Android source is integrated.</p></div>
        <div className="search-row"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="https://apps.apple.com/... or 123456789" />
          <button className="primary" disabled={busy || input.trim().length < 2} onClick={submit}><Search size={18} /> {busy ? 'Analyzing…' : 'Analyze'}</button></div>
        {error && <div className="error-box">{error}</div>}
      </section>

      {!result && <section className="empty-state panel"><h3>M1 + Scorecard</h3><p>Analyze one title to build an evidence-backed dossier and preliminary decision. Unknown market dimensions remain unknown until Trend Radar and Competitor Map exist.</p></section>}

      {result && <>
        <section className="game-header panel">
          {result.game.iconUrl && <img src={result.game.iconUrl} alt="" />}
          <div className="game-heading"><div className="eyebrow">{result.game.platform.toUpperCase()} · {result.sourceMode.toUpperCase()}</div><h2>{result.game.canonicalName}</h2><p>{result.game.publisher ?? 'Publisher unknown'}</p><a href={result.game.storeUrl} target="_blank" rel="noreferrer">Store page <ExternalLink size={14} /></a></div>
          <div className="review-meter"><strong>{reviewedCount}/{result.findings.length}</strong><span>findings reviewed this session</span></div>
        </section>

        <section className="evidence-preview panel">
          <div><h3>Store evidence</h3><p>{result.game.description ? `${result.game.description.slice(0, 700)}${result.game.description.length > 700 ? '…' : ''}` : 'No store description returned.'}</p></div>
          {result.game.screenshots.length > 0 && <div className="screenshot-strip">{result.game.screenshots.slice(0, 6).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="App Store screenshot evidence" /></a>)}</div>}
        </section>

        <section className="two-column">
          <div className="panel"><h3>Evidence-backed findings</h3><div className="finding-grid">{result.findings.map((finding) => <FindingCard key={finding.id} finding={finding} onReview={reviewFinding} />)}</div></div>
          <aside className="panel unknown-panel"><h3>Unknown / not yet verified</h3><ul>{result.unknowns.map((item) => <li key={item}>{item}</li>)}</ul><div className="principle-box"><strong>Radar rule</strong><p>Listing evidence can support publisher claims. It cannot prove gameplay behavior, market momentum or differentiation.</p></div></aside>
        </section>

        <section className="panel scorecard-panel">
          <div className="scorecard-heading"><div><div className="eyebrow">PRELIMINARY DECISION</div><h2>Opportunity Scorecard</h2><p>Confidence starts at 2 because the current dossier is listing-only. Change a score only when you have evidence for it.</p></div><div className={`decision-chip decision-${decision.status.toLowerCase().replace(' ', '-')}`}><strong>{decision.status}</strong><span>{decision.reasons[0]}</span></div></div>
          <div className="score-grid">{(Object.keys(dimensionMeta) as ScoreDimension[]).map((dimension) => <ScorePicker key={dimension} dimension={dimension} value={scorecard[dimension]} onChange={(value) => setScore(dimension, value)} />)}</div>
          {decision.missing.length > 0 && <div className="missing-evidence"><strong>Still missing:</strong> {decision.missing.map((key) => dimensionMeta[key].label).join(', ')}</div>}
          <div className="hard-blocks"><strong>Hard blockers</strong><p>Any active hard blocker forces PASS regardless of the numeric scores.</p>
            {['IP / trademark imitation risk', 'Backend / multiplayer / content scope is unrealistic', 'Material legal or store-policy issue'].map((block) => <label key={block}><input type="checkbox" checked={scorecard.hardBlocks.includes(block)} onChange={() => toggleBlock(block)} /> {block}</label>)}
          </div>
          <div className="decision-rule-note"><strong>Prototype threshold:</strong> Momentum ≥4 · Solo Fit ≥4 · Differentiation ≥3 · Risk ≤2 · Confidence ≥3 · no hard blockers. BUILD NOW remains unavailable until an internal prototype is validated.</div>
        </section>
      </>}
    </main>
  );
}
