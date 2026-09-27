import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { AppShell } from './AppShell';
import {
  navigateAppRoute,
  parseAppRoute,
  type AppRoute,
  type AppView,
} from './appRouter';
import { DeepVerifyWorkspace } from './DeepVerifyWorkspace';
import { PlatformAnalyzePage } from './PlatformAnalyzePage';
import { PlatformCompetitorsPage } from './PlatformCompetitorsPage';
import { PlatformContextPanel } from './PlatformContextPanel';
import { PlatformResearchHome } from './PlatformResearchHome';
import {
  canUseAppleOnlyEvidencePipeline,
  isPlatformScope,
  PLATFORM_META,
  PLATFORM_SCOPE_STORAGE_KEY,
  type PlatformScope,
} from './platformScope';
import { PolicyWatch } from './PolicyWatch';
import { ReviewSamples } from './ReviewSamples';
import { SavedDossiers } from './SavedDossiers';
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

function initialPlatformScope(): PlatformScope {
  if (typeof window === 'undefined') return 'cross';
  const stored = window.localStorage.getItem(PLATFORM_SCOPE_STORAGE_KEY);
  return isPlatformScope(stored) ? stored : 'cross';
}

function PlatformPipelineBoundary({ scope, feature, persistence = false }: { scope: PlatformScope; feature: string; persistence?: boolean }) {
  const cross = scope === 'cross';
  return <>
    <PlatformContextPanel scope={scope} />
    <section className="panel platform-research-empty">
      <div className="eyebrow">PLATFORM BOUNDARY</div>
      <h1>{feature} is not available as blended {PLATFORM_META[scope].label} evidence.</h1>
      <p>{persistence
        ? `The current ${feature} storage contract uses an Apple-oriented store_id without a platform namespace. Radar therefore keeps this persisted workspace Apple-only until a canonical (platform, store ID) identity is added, rather than risking Google/Amazon evidence being saved under an ambiguous Apple-shaped identifier.`
        : cross
          ? 'This pipeline currently contains Apple-specific evidence. Cross-platform mode is a coverage overview only, so Radar will not display the Apple pipeline under an All-platform label. Select Apple explicitly to inspect it.'
          : `Radar is deliberately not reusing Apple ranks or Apple verification tasks as if they belonged to ${PLATFORM_META[scope].label}. Select Apple to inspect the existing Apple pipeline, or use Today/Analyze/Competitors for evidence currently available to this platform.`}</p>
    </section>
  </>;
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const [platformScope, setPlatformScope] = useState<PlatformScope>(initialPlatformScope);
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
    window.localStorage.setItem(PLATFORM_SCOPE_STORAGE_KEY, platformScope);
  }, [platformScope]);

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
    if (route.view !== 'deep-verify' || !route.sessionId || !canUseAppleOnlyEvidencePipeline(platformScope)) {
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
  }, [platformScope, route.sessionId, route.videoId, route.view]);

  function changePlatformScope(scope: PlatformScope) {
    setPlatformScope(scope);
  }

  function openPage(view: AppView) {
    navigateAppRoute({ view });
  }

  function openAppleAnalyze(appId?: string) {
    setPlatformScope('apple');
    navigateAppRoute({ view: 'analyze', appId });
  }

  function openSavedRun(runId: string) {
    setPlatformScope('apple');
    navigateAppRoute({ view: 'analyze', runId });
  }

  function openDeepVerify(session: VerificationCaptureSession, videoId?: string) {
    setPlatformScope('apple');
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
        setPlatformScope('apple');
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
      setPlatformScope('apple');
      navigateAppRoute({ view: 'verification' });
    }
  }

  const deepVerifySession = deepVerifySeed?.session ?? null;
  const applePipelineVisible = canUseAppleOnlyEvidencePipeline(platformScope);

  return <AppShell
    route={route}
    owner={owner}
    platformScope={platformScope}
    onPlatformScopeChange={changePlatformScope}
    onNavigate={openPage}
  >
    {route.view === 'today' && <PlatformResearchHome scope={platformScope} onAnalyze={openAppleAnalyze} />}
    {route.view === 'trends' && (applePipelineVisible
      ? <><PlatformContextPanel scope="apple" /><TrendSignalsPage onAnalyze={openAppleAnalyze} /></>
      : <PlatformPipelineBoundary scope={platformScope} feature="Trend Signals" />)}
    {route.view === 'verification' && (applePipelineVisible
      ? <><PlatformContextPanel scope="apple" /><VerificationQueuePage onDeepVerify={openDeepVerify} onCompetitors={() => openPage('competitors')} /></>
      : <PlatformPipelineBoundary scope={platformScope} feature="Verification Queue" />)}
    {route.view === 'analyze' && <PlatformAnalyzePage
      scope={route.runId ? 'apple' : platformScope}
      initialInput={route.runId ? '' : route.appId ?? ''}
      initialRunId={route.runId ?? null}
      ownerEmail={owner?.email ?? null}
    />}
    {route.view === 'saved' && <><PlatformContextPanel scope="apple" /><SavedDossiers ownerEmail={owner?.email ?? null} onOpen={openSavedRun} /></>}
    {route.view === 'competitors' && <PlatformCompetitorsPage scope={platformScope} ownerEmail={owner?.email ?? null} />}
    {route.view === 'reviews' && (applePipelineVisible
      ? <><PlatformContextPanel scope="apple" /><ReviewSamples ownerEmail={owner?.email ?? null} /></>
      : <PlatformPipelineBoundary scope={platformScope} feature="Review Samples" persistence />)}
    {route.view === 'deep-verify' && (applePipelineVisible ? <>
      <PlatformContextPanel scope="apple" />
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
    </> : <PlatformPipelineBoundary scope={platformScope} feature="Deep Verify" persistence />)}
    {route.view === 'policy' && <PolicyWatch ownerEmail={owner?.email ?? null} />}
  </AppShell>;
}
