import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, LogOut, Mail, Search, ShieldQuestion, XCircle } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { analyzeGame, setFindingReviewState } from './api';
import type { AnalysisResult, Finding, ReviewState } from './domain';
import { hasSupabaseConfig, supabase } from './lib/supabase';

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
      <div className="finding-topline">
        <strong>{finding.label}</strong>
        <ReviewBadge state={finding.reviewState} />
      </div>
      <div className="finding-value">{finding.value}</div>
      <div className="finding-meta">
        <span>{finding.coverage}</span>
        <span>{finding.interpretation}</span>
        <span>{finding.origin}</span>
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

function LoginPanel() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendMagicLink() {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const redirectUrl = window.location.href.split('#')[0].split('?')[0];
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
        shouldCreateUser: false,
      },
    });
    setBusy(false);
    setMessage(error ? error.message : 'Check your email for the secure sign-in link.');
  }

  return (
    <main className="page-shell login-shell">
      <section className="panel login-panel">
        <div className="eyebrow">GAME OPPORTUNITY RADAR 2.0</div>
        <h1>Private studio intelligence.</h1>
        <p>Sign in with the pre-approved account. Public user creation is disabled by the client flow.</p>
        {!hasSupabaseConfig ? (
          <div className="error-box">Cloud backend is not configured for this deployment yet.</div>
        ) : (
          <>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            <button className="primary" disabled={busy || !email.includes('@')} onClick={sendMagicLink}>
              <Mail size={18} /> {busy ? 'Sending…' : 'Email sign-in link'}
            </button>
            {message && <div className="info-box">{message}</div>}
          </>
        )}
      </section>
    </main>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const reviewedCount = useMemo(
    () => result?.findings.filter((finding) => finding.reviewState !== 'unreviewed').length ?? 0,
    [result],
  );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      setResult(await analyzeGame(input));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setBusy(false);
    }
  }

  async function reviewFinding(id: string, state: ReviewState) {
    try {
      await setFindingReviewState(id, state);
      setResult((current) => current ? {
        ...current,
        findings: current.findings.map((finding) => finding.id === id ? { ...finding, reviewState: state } : finding),
      } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update review state.');
    }
  }

  if (!authReady) return <main className="page-shell"><section className="panel">Loading secure session…</section></main>;
  if (hasSupabaseConfig && !session) return <LoginPanel />;

  return (
    <main className="page-shell">
      <header className="hero">
        <div>
          <div className="eyebrow">GAME OPPORTUNITY RADAR 2.0</div>
          <h1>Analyze one game properly before automating the whole market.</h1>
          <p>Facts, estimates, inference, unknowns and human review remain visibly separate.</p>
        </div>
        <div className={`connection-card ${hasSupabaseConfig ? 'ok' : 'warn'}`}>
          {hasSupabaseConfig ? <CheckCircle2 /> : <AlertTriangle />}
          <div>
            <strong>{hasSupabaseConfig ? 'Private cloud session' : 'Cloud setup required'}</strong>
            <span>{session?.user.email ?? (hasSupabaseConfig ? 'Authenticated' : 'Supabase environment variables missing.')}</span>
            {session && <button className="link-button" onClick={() => void supabase?.auth.signOut()}><LogOut size={14} /> Sign out</button>}
          </div>
        </div>
      </header>

      <section className="panel analyze-panel">
        <div>
          <h2>Analyze a Game</h2>
          <p>For the reliable M1 path, paste an App Store URL or numeric Apple store ID. Title search is provisional; Google Play remains assisted until an approved Android source is integrated.</p>
        </div>
        <div className="search-row">
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="https://apps.apple.com/... or 123456789" />
          <button className="primary" disabled={busy || input.trim().length < 2} onClick={submit}>
            <Search size={18} /> {busy ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
        {error && <div className="error-box">{error}</div>}
      </section>

      {!result && (
        <section className="empty-state panel">
          <h3>M1 acceptance target</h3>
          <p>Apple URL/store-ID inputs resolve automatically through the server-side analyzer. Unsupported Android enrichment must return an explicit assisted/manual requirement rather than invented data.</p>
        </section>
      )}

      {result && (
        <>
          <section className="game-header panel">
            {result.game.iconUrl && <img src={result.game.iconUrl} alt="" />}
            <div className="game-heading">
              <div className="eyebrow">{result.game.platform.toUpperCase()} · {result.sourceMode.toUpperCase()}</div>
              <h2>{result.game.canonicalName}</h2>
              <p>{result.game.publisher ?? 'Publisher unknown'}</p>
              <a href={result.game.storeUrl} target="_blank" rel="noreferrer">Store page <ExternalLink size={14} /></a>
            </div>
            <div className="review-meter">
              <strong>{reviewedCount}/{result.findings.length}</strong>
              <span>findings reviewed</span>
            </div>
          </section>

          <section className="two-column">
            <div className="panel">
              <h3>Evidence-backed findings</h3>
              <div className="finding-grid">
                {result.findings.map((finding) => <FindingCard key={finding.id} finding={finding} onReview={reviewFinding} />)}
              </div>
            </div>
            <aside className="panel unknown-panel">
              <h3>Unknown / not yet verified</h3>
              {result.unknowns.length === 0 ? <p>No explicit unknowns returned.</p> : (
                <ul>{result.unknowns.map((item) => <li key={item}>{item}</li>)}</ul>
              )}
              <div className="principle-box">
                <strong>Radar rule</strong>
                <p>Absence of evidence is not evidence that a system does not exist. Gameplay-only questions stay unknown until Deep Verify.</p>
              </div>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}
