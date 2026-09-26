import { useEffect, useState } from 'react';
import { Cloud, ExternalLink, RefreshCw } from 'lucide-react';
import { listSavedDossiers } from './api';
import type { SavedDossierSummary } from './saved';
import './saved-dossiers.css';

export function SavedDossiers({ ownerEmail, onOpen }: { ownerEmail: string | null; onOpen: (runId: string) => void }) {
  const [items, setItems] = useState<SavedDossierSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!ownerEmail) {
      setItems([]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setItems(await listSavedDossiers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load saved dossiers.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [ownerEmail]);

  return <section className="saved-view">
    <header className="hero">
      <div>
        <div className="eyebrow">OWNER WORKSPACE</div>
        <h1>Saved dossiers</h1>
        <p>Reopen the exact evidence snapshot, human review state, and scorecard that were saved together.</p>
      </div>
      <div className={`connection-card ${ownerEmail ? 'ok' : 'warn'}`}>
        <Cloud />
        <div>
          <strong>{ownerEmail ? 'Private cloud workspace' : 'Owner sign-in required'}</strong>
          <span>{ownerEmail ? ownerEmail : 'Public preview cannot read or write private dossiers.'}</span>
        </div>
      </div>
    </header>

    {!ownerEmail && <section className="panel empty-state"><h3>Sign in from the top bar</h3><p>Saved dossiers are protected by Supabase Auth and row-level security. Anonymous visitors cannot enumerate them.</p></section>}

    {ownerEmail && <section className="panel saved-panel">
      <div className="saved-toolbar">
        <div><h2>Cloud history</h2><p>Each entry is a specific saved analysis run, not a mutable “latest” record.</p></div>
        <button disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} /> {busy ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {error && <div className="error-box">{error}</div>}
      {!busy && !error && items.length === 0 && <div className="empty-state compact"><h3>No saved dossiers yet</h3><p>Analyze a game, review the findings, adjust the scorecard, then use “Save dossier”.</p></div>}
      <div className="saved-grid">
        {items.map((item) => <article className="saved-card" key={item.runId}>
          <div className="saved-card-main">
            <div className="eyebrow">{item.platform?.toUpperCase() ?? 'STORE'} · {item.decisionStatus ?? 'UNSCORED'}</div>
            <h3>{item.canonicalName}</h3>
            <p>{item.publisher ?? 'Publisher unknown'}</p>
            <div className="saved-meta">
              <span>{item.reviewedCount}/{item.findingCount} findings reviewed</span>
              {item.storeId && <span>Store ID {item.storeId}</span>}
              <span>{item.savedAt ? new Date(item.savedAt).toLocaleString() : 'Save time unavailable'}</span>
            </div>
          </div>
          <button className="primary" onClick={() => onOpen(item.runId)}>Open saved run <ExternalLink size={16} /></button>
        </article>)}
      </div>
    </section>}
  </section>;
}
