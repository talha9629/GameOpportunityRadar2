export type AppView =
  | 'today'
  | 'trends'
  | 'verification'
  | 'analyze'
  | 'saved'
  | 'competitors'
  | 'reviews'
  | 'deep-verify'
  | 'policy';

export interface AppRoute {
  view: AppView;
  appId?: string;
  runId?: string;
  sessionId?: string;
  videoId?: string;
}

const viewToPath: Record<AppView, string> = {
  today: 'today',
  trends: 'trends',
  verification: 'verify',
  analyze: 'analyze',
  saved: 'saved',
  competitors: 'competitors',
  reviews: 'reviews',
  'deep-verify': 'deep-verify',
  policy: 'policy',
};

const pathToView = Object.fromEntries(
  Object.entries(viewToPath).map(([view, path]) => [path, view]),
) as Record<string, AppView>;

function validAppId(value: string | null) {
  return value && /^\d{5,}$/.test(value) ? value : undefined;
}

function validUuid(value: string | null) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

function validSessionId(value: string | null) {
  return value && /^[a-f0-9]{24}$/.test(value) ? value : undefined;
}

export function parseAppRoute(hash: string): AppRoute {
  const raw = hash.replace(/^#/, '').trim();
  if (!raw) return { view: 'today' };

  try {
    const url = new URL(raw.startsWith('/') ? `https://radar.invalid${raw}` : `https://radar.invalid/${raw}`);
    const path = url.pathname.replace(/^\/+|\/+$/g, '') || 'today';
    const view = pathToView[path] ?? 'today';

    if (view === 'analyze') {
      return {
        view,
        appId: validAppId(url.searchParams.get('app')),
        runId: validUuid(url.searchParams.get('run')),
      };
    }

    if (view === 'deep-verify') {
      return {
        view,
        sessionId: validSessionId(url.searchParams.get('session')),
        videoId: validUuid(url.searchParams.get('video')),
      };
    }

    return { view };
  } catch {
    return { view: 'today' };
  }
}

export function appRouteHash(route: AppRoute) {
  const path = viewToPath[route.view];
  const params = new URLSearchParams();

  if (route.view === 'analyze') {
    if (route.appId) params.set('app', route.appId);
    if (route.runId) params.set('run', route.runId);
  }

  if (route.view === 'deep-verify') {
    if (route.sessionId) params.set('session', route.sessionId);
    if (route.videoId) params.set('video', route.videoId);
  }

  const query = params.toString();
  return `#/${path}${query ? `?${query}` : ''}`;
}

export function navigateAppRoute(route: AppRoute, options: { replace?: boolean } = {}) {
  const target = appRouteHash(route);
  if (typeof window === 'undefined') return;

  if (options.replace) {
    const current = `${window.location.pathname}${window.location.search}${target}`;
    window.history.replaceState(null, '', current);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }

  if (window.location.hash === target) return;
  window.location.hash = target.slice(1);
}

export const APP_PAGE_META: Record<AppView, { title: string; section: string; description: string }> = {
  today: {
    title: 'Today',
    section: 'Discover',
    description: 'Current market evidence, data health, research queue, and exact-date changes.',
  },
  trends: {
    title: 'Trend Signals',
    section: 'Discover',
    description: 'Observed cross-market rank signals with explicit history maturity.',
  },
  verification: {
    title: 'Verify Queue',
    section: 'Discover',
    description: 'Route unresolved unknowns to the cheapest admissible evidence source.',
  },
  analyze: {
    title: 'Analyze Game',
    section: 'Research',
    description: 'Build an evidence-backed store dossier and decision scorecard.',
  },
  saved: {
    title: 'Saved Dossiers',
    section: 'Research',
    description: 'Reopen owner-saved analyses and their durable evidence snapshots.',
  },
  competitors: {
    title: 'Competitors',
    section: 'Research',
    description: 'Map human-confirmed relationships and differentiation evidence.',
  },
  reviews: {
    title: 'Review Samples',
    section: 'Research',
    description: 'Analyze supplied review samples without generalizing beyond the sample.',
  },
  'deep-verify': {
    title: 'Deep Verify',
    section: 'Evidence',
    description: 'Turn gameplay footage into timestamped, reviewable evidence.',
  },
  policy: {
    title: 'Policy Watch',
    section: 'Governance',
    description: 'Track stability-confirmed changes on official Apple and Google policy sources.',
  },
};
