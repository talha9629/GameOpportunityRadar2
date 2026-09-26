import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Analyze } from './Analyze';
import { Competitors } from './Competitors';
import { SavedDossiers } from './SavedDossiers';
import { Today } from './Today';
import { OwnerAccess } from './OwnerAccess';
import { getOwnerUser, subscribeOwnerAuth } from './auth';

type View = 'today' | 'analyze' | 'competitors' | 'saved';

export function App() {
  const [view, setView] = useState<View>('today');
  const [analyzeSeed, setAnalyzeSeed] = useState<string | null>(null);
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [owner, setOwner] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    void getOwnerUser().then((user) => {
      if (active) setOwner(user);
    });
    const unsubscribe = subscribeOwnerAuth((user) => setOwner(user));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  function openAnalyze(appId?: string) {
    setSavedRunId(null);
    setAnalyzeSeed(appId ?? null);
    setView('analyze');
  }

  function openSavedRun(runId: string) {
    setAnalyzeSeed(null);
    setSavedRunId(runId);
    setView('analyze');
  }

  return (
    <main className="page-shell">
      <nav className="top-nav">
        <div className="brand-block">
          <div className="brand-mark">R2</div>
          <div><strong>Game Opportunity Radar</strong><span>Studio intelligence</span></div>
        </div>
        <div className="nav-tabs">
          <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}>Today</button>
          <button className={view === 'analyze' ? 'active' : ''} onClick={() => openAnalyze()}>Analyze Game</button>
          <button className={view === 'saved' ? 'active' : ''} onClick={() => setView('saved')}>Saved Dossiers</button>
          <button className={view === 'competitors' ? 'active' : ''} onClick={() => setView('competitors')}>Competitors</button>
          <button disabled title="Next milestone">Deep Verify</button>
        </div>
        <OwnerAccess user={owner} />
      </nav>
      {view === 'today' && <Today onAnalyze={(appId) => openAnalyze(appId)} />}
      {view === 'analyze' && <Analyze key={savedRunId ?? analyzeSeed ?? 'manual'} initialInput={analyzeSeed ?? ''} initialRunId={savedRunId} ownerEmail={owner?.email ?? null} />}
      {view === 'saved' && <SavedDossiers ownerEmail={owner?.email ?? null} onOpen={openSavedRun} />}
      {view === 'competitors' && <Competitors />}
    </main>
  );
}
