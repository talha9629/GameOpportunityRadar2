import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Analyze } from './Analyze';
import { Competitors } from './Competitors';
import { DeepVerifyWorkspace } from './DeepVerifyWorkspace';
import { PolicyWatch } from './PolicyWatch';
import { ReviewSamples } from './ReviewSamples';
import { SavedDossiers } from './SavedDossiers';
import { Today } from './Today';
import { VerificationQueuePage } from './VerificationQueuePage';
import { OwnerAccess } from './OwnerAccess';
import { getOwnerUser, subscribeOwnerAuth } from './auth';

type View = 'today' | 'verification' | 'analyze' | 'competitors' | 'reviews' | 'deep-verify' | 'policy' | 'saved';
type DeepVerifySeed = { appId: string; name: string } | null;

export function App() {
  const [view, setView] = useState<View>('today');
  const [analyzeSeed, setAnalyzeSeed] = useState<string | null>(null);
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [deepVerifySeed, setDeepVerifySeed] = useState<DeepVerifySeed>(null);
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

  function openDeepVerify(appId: string, name: string) {
    setDeepVerifySeed({ appId, name });
    setView('deep-verify');
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
          <button className={view === 'verification' ? 'active' : ''} onClick={() => setView('verification')}>Verify Queue</button>
          <button className={view === 'analyze' ? 'active' : ''} onClick={() => openAnalyze()}>Analyze Game</button>
          <button className={view === 'saved' ? 'active' : ''} onClick={() => setView('saved')}>Saved Dossiers</button>
          <button className={view === 'competitors' ? 'active' : ''} onClick={() => setView('competitors')}>Competitors</button>
          <button className={view === 'reviews' ? 'active' : ''} onClick={() => setView('reviews')}>Reviews</button>
          <button className={view === 'deep-verify' ? 'active' : ''} onClick={() => { setDeepVerifySeed(null); setView('deep-verify'); }}>Deep Verify</button>
          <button className={view === 'policy' ? 'active' : ''} onClick={() => setView('policy')}>Policy Watch</button>
        </div>
        <OwnerAccess user={owner} />
      </nav>
      {view === 'today' && <Today onAnalyze={(appId) => openAnalyze(appId)} />}
      {view === 'verification' && <VerificationQueuePage onDeepVerify={openDeepVerify} onCompetitors={() => setView('competitors')} />}
      {view === 'analyze' && <Analyze key={savedRunId ?? analyzeSeed ?? 'manual'} initialInput={analyzeSeed ?? ''} initialRunId={savedRunId} ownerEmail={owner?.email ?? null} />}
      {view === 'saved' && <SavedDossiers ownerEmail={owner?.email ?? null} onOpen={openSavedRun} />}
      {view === 'competitors' && <Competitors ownerEmail={owner?.email ?? null} />}
      {view === 'reviews' && <ReviewSamples ownerEmail={owner?.email ?? null} />}
      {view === 'deep-verify' && <>
        {deepVerifySeed && <div className="history-banner"><strong>Verification target: {deepVerifySeed.name}</strong><span>Apple ID {deepVerifySeed.appId}. Use this target when saving the gameplay evidence below.</span></div>}
        <DeepVerifyWorkspace key={deepVerifySeed ? `${deepVerifySeed.appId}:${deepVerifySeed.name}` : 'manual'} ownerEmail={owner?.email ?? null} />
      </>}
      {view === 'policy' && <PolicyWatch ownerEmail={owner?.email ?? null} />}
    </main>
  );
}
