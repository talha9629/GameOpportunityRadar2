import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Analyze } from './Analyze';
import { AppShell } from './AppShell';
import {
  navigateAppRoute,
  parseAppRoute,
  type AppRoute,
  type AppView,
} from './appRouter';
import { Competitors } from './Competitors';
import { DeepVerifyWorkspace } from './DeepVerifyWorkspace';
import { PolicyWatch } from './PolicyWatch';
import { ReviewSamples } from './ReviewSamples';
import { SavedDossiers } from './SavedDossiers';
import { Today } from './Today';
import { TrendSignalsPage } from './TrendSignalsPage';
import { VerificationQueuePage } from './VerificationQueuePage';
import { loadVerificationQueue, type VerificationCaptureSession } from './verificationQueue';
import { latestEvidenceForSession } from './verificationEvidence';
import { listVerificationSessionEvidence } from './verificationEvidenceApi';
import { subscribeDeepVerifyRequests } from './navigation';
import { getOwnerUser, subscribeOwnerAuth } from './auth';

type DeepVerifySeed = {
  session: VerificationCaptureSession;
  initialVideoId: string | null;
} | null;

function initialRoute(): AppRoute {
  if (typeof window === 'undefined') return { view: 'today' };
  return parseAppRoute(window.location.hash);
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const [deepVerifySeed, setDeepVerifySeed] = useState<DeepVerifySeed>(null);
  const [deepVerifyHydrating, setDeepVerifyHydrating] = useState(false);
  const [owner, setOwner] = useState<User | null>(null);

  useEffect(() => {
    const syncRoute = () => setRoute(parseAppRoute(window.location.hash));
    window.addEventListener('hashchange', syncRoute);
    if (!window.location.hash) navigateAppRoute({ view: 'today' }, { replace: true });
    else syncRoute();
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

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

  useEffect(() => subscribeDeepVerifyRequests((appId) => {
    void openDeepVerifyForApp(appId);
  }), []);

  useEffect(() => {
    let active = true;
    if (route.view !== 'deep-verify' || !route.sessionId) {
      setDeepVerifySeed(null);
      setDeepVerifyHydrating(false);
      return () => { active = false; };
    }

    setDeepVerifyHydrating(true);
    void loadVerificationQueue()
      .then((queue) => {
        if (!active) return;
        const session = queue.captureSessions.find((item) => item.sessionId === route.sessionId);
        setDeepVerifySeed(session ? { session, initialVideoId: route.videoId ?? null } : null);
      })
      .catch(() => {
        if (active) setDeepVerifySeed(null);
      })
      .finally(() => {
        if (active) setDeepVerifyHydrating(false);
      });

    return () => { active = false; };
  }, [route.sessionId, route.videoId, route.view]);

  function openPage(view: AppView) {
    navigateAppRoute({ view });
  }

  function openAnalyze(appId?: string) {
    navigateAppRoute({ view: 'analyze', appId });
  }

  function openSavedRun(runId: string) {
    navigateAppRoute({ view: 'analyze', runId });
  }

  function openDeepVerify(session: VerificationCaptureSession, videoId?: string) {
    navigateAppRoute({
      view: 'deep-verify',
      sessionId: session.sessionId,
      videoId,
    });
  }

  async function openDeepVerifyForApp(appId: string) {
    try {
      const queue = await loadVerificationQueue();
      const session = queue.captureSessions.find((item) => item.appId === appId);
      if (!session) {
        navigateAppRoute({ view: 'verification' });
        return;
      }

      let videoId: string | undefined;
      try {
        const evidence = await listVerificationSessionEvidence([session.sessionId]);
        videoId = latestEvidenceForSession(evidence, session.sessionId)?.videoId;
      } catch {
        // Owner evidence is an enhancement. Collection mode remains reachable when
        // signed out or if owner-only evidence lookup is temporarily unavailable.
      }
      openDeepVerify(session, videoId);
    } catch {
      navigateAppRoute({ view: 'verification' });
    }
  }

  const deepVerifySession = deepVerifySeed?.session ?? null;

  return <AppShell route={route} owner={owner} onNavigate={openPage}>
    {route.view === 'today' && <Today onAnalyze={(appId) => openAnalyze(appId)} />}
    {route.view === 'trends' && <TrendSignalsPage onAnalyze={(appId) => openAnalyze(appId)} />}
    {route.view === 'verification' && <VerificationQueuePage onDeepVerify={openDeepVerify} onCompetitors={() => openPage('competitors')} />}
    {route.view === 'analyze' && <Analyze
      key={route.runId ?? route.appId ?? 'manual'}
      initialInput={route.runId ? '' : route.appId ?? ''}
      initialRunId={route.runId ?? null}
      ownerEmail={owner?.email ?? null}
    />}
    {route.view === 'saved' && <SavedDossiers ownerEmail={owner?.email ?? null} onOpen={openSavedRun} />}
    {route.view === 'competitors' && <Competitors ownerEmail={owner?.email ?? null} />}
    {route.view === 'reviews' && <ReviewSamples ownerEmail={owner?.email ?? null} />}
    {route.view === 'deep-verify' && <>
      {route.sessionId && deepVerifyHydrating && <div className="history-banner"><strong>Loading verification session…</strong><span>Restoring the exact queue/evidence context from this page URL.</span></div>}
      {route.sessionId && !deepVerifyHydrating && !deepVerifySession && <div className="warning-banner"><span>This verification session is no longer present in the current generated queue. Open Verify Queue to choose a current evidence session.</span></div>}
      {deepVerifySession && <div className="history-banner">
        <strong>Verification session S{deepVerifySession.sessionOrder}: {deepVerifySession.name}</strong>
        <span>{deepVerifySeed?.initialVideoId
          ? `Opening the latest saved source linked to ${deepVerifySession.taskCount} atomic evidence gap${deepVerifySession.taskCount === 1 ? '' : 's'}.`
          : `Apple ID ${deepVerifySession.appId} · ${deepVerifySession.taskCount} atomic evidence gap${deepVerifySession.taskCount === 1 ? '' : 's'} will be linked to this capture when it is saved.`}</span>
      </div>}
      {(!route.sessionId || deepVerifySession) && <DeepVerifyWorkspace
        key={deepVerifySession ? `${deepVerifySession.sessionId}:${deepVerifySession.source.researchGeneratedAt}:${deepVerifySeed?.initialVideoId ?? 'collect'}` : 'manual'}
        ownerEmail={owner?.email ?? null}
        initialStoreId={deepVerifySession?.appId ?? ''}
        initialLabel={deepVerifySession ? `${deepVerifySession.name} gameplay verification` : ''}
        initialVideoId={deepVerifySeed?.initialVideoId ?? null}
        verificationSession={deepVerifySession ? {
          sessionId: deepVerifySession.sessionId,
          taskIds: deepVerifySession.taskIds,
          unknowns: deepVerifySession.unknowns,
          categories: deepVerifySession.categories,
          researchGeneratedAt: deepVerifySession.source.researchGeneratedAt,
        } : null}
      />}
    </>}
    {route.view === 'policy' && <PolicyWatch ownerEmail={owner?.email ?? null} />}
  </AppShell>;
}
