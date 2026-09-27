import { z } from 'zod';

export const GameplayDiscoveryProviderKeySchema = z.enum(['tavily', 'gemini_google_search', 'none']);

export const GameplaySourceCandidateSchema = z.object({
  rank: z.number().int().positive().max(3),
  url: z.string().url().refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'www.youtube.com' && url.pathname === '/watch' && Boolean(url.searchParams.get('v'));
    } catch {
      return false;
    }
  }, 'Gameplay discovery candidates must be canonical public YouTube watch URLs.'),
  title: z.string().min(1).max(300),
  snippet: z.string().max(700),
  score: z.number().min(0).max(1).nullable(),
  channelName: z.string().max(180).nullable(),
  thumbnailUrl: z.string().url().nullable(),
  availabilityVerifiedAt: z.string().nullable(),
  discoveryProvider: GameplayDiscoveryProviderKeySchema,
  domain: z.literal('youtube.com'),
  sourceOrigin: z.literal('third_party_public'),
  interpretation: z.literal('search_candidate'),
  reviewState: z.literal('suggested'),
});

export const GameplayDiscoverySessionSchema = z.object({
  sessionId: z.string().regex(/^[a-f0-9]{24}$/),
  appId: z.string().min(5),
  name: z.string().min(1),
  queueRank: z.number().int().positive(),
  query: z.string().min(10),
  providerKey: GameplayDiscoveryProviderKeySchema,
  searchQueries: z.array(z.string().min(1).max(300)).max(20),
  searchedAt: z.string().nullable(),
  status: z.enum(['found', 'no_result', 'search_failed', 'unconfigured']),
  candidates: z.array(GameplaySourceCandidateSchema).max(3),
  error: z.string().nullable(),
}).superRefine((value, context) => {
  if (value.status === 'found' && value.candidates.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates'], message: 'Found discovery sessions require at least one candidate.' });
  }
  if (value.status === 'unconfigured' && (value.searchedAt !== null || value.candidates.length > 0 || value.searchQueries.length > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Unconfigured sessions cannot contain search output.' });
  }
});

const GameplayDiscoveryV2Schema = z.object({
  schemaVersion: z.literal(2),
  generatedAt: z.string(),
  verificationGeneratedAt: z.string(),
  statement: z.string().min(40),
  provider: z.object({
    key: GameplayDiscoveryProviderKeySchema,
    name: z.enum(['Tavily', 'Gemini Search', 'None']),
    status: z.enum(['unconfigured', 'complete', 'partial', 'failed']),
    sourceOrigin: z.literal('third_party_public_search'),
    sourceMode: z.literal('assisted'),
    mode: z.enum(['tavily_basic', 'gemini_google_search_grounding', 'unconfigured']),
    model: z.string().nullable(),
    costModel: z.string().min(10),
    dailyRequestCap: z.number().int().min(0).max(8),
    requestsUsedThisRun: z.number().int().min(0).max(8),
    searchQueriesUsedThisRun: z.number().int().nonnegative(),
    attemptedSessions: z.number().int().min(0).max(8),
    successfulSearches: z.number().int().min(0).max(8),
    failedSearches: z.number().int().min(0).max(8),
    note: z.string().min(20),
  }),
  sessions: z.array(GameplayDiscoverySessionSchema).max(8),
}).superRefine((value, context) => {
  if (value.provider.requestsUsedThisRun > value.provider.dailyRequestCap) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['provider', 'requestsUsedThisRun'], message: 'Discovery request usage exceeds the hard cap.' });
  }
  if (value.provider.attemptedSessions !== value.provider.requestsUsedThisRun) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['provider', 'attemptedSessions'], message: 'Provider requests must match attempted sessions.' });
  }
  if (value.provider.attemptedSessions !== value.provider.successfulSearches + value.provider.failedSearches) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['provider', 'attemptedSessions'], message: 'Search outcomes must account for every attempted session.' });
  }
});

function normalizeLegacyDiscovery(input: unknown) {
  if (!input || typeof input !== 'object') return input;
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion !== 1 || !raw.provider || typeof raw.provider !== 'object') return input;

  const provider = raw.provider as Record<string, unknown>;
  const configured = provider.status !== 'unconfigured';
  const requestsUsed = Number.isInteger(provider.creditsUsedThisRun) ? Number(provider.creditsUsedThisRun) : 0;
  const sessions = Array.isArray(raw.sessions) ? raw.sessions.map((sessionRaw) => {
    if (!sessionRaw || typeof sessionRaw !== 'object') return sessionRaw;
    const session = sessionRaw as Record<string, unknown>;
    const searched = typeof session.searchedAt === 'string' && session.searchedAt.length > 0;
    const candidates = Array.isArray(session.candidates) ? session.candidates.map((candidateRaw) => {
      if (!candidateRaw || typeof candidateRaw !== 'object') return candidateRaw;
      const candidate = candidateRaw as Record<string, unknown>;
      return {
        ...candidate,
        channelName: null,
        thumbnailUrl: null,
        availabilityVerifiedAt: null,
        discoveryProvider: 'tavily',
      };
    }) : [];
    return {
      ...session,
      providerKey: configured ? 'tavily' : 'none',
      searchQueries: searched && typeof session.query === 'string' ? [session.query] : [],
      candidates,
    };
  }) : [];

  return {
    ...raw,
    schemaVersion: 2,
    provider: {
      key: configured ? 'tavily' : 'none',
      name: configured ? 'Tavily' : 'None',
      status: provider.status,
      sourceOrigin: provider.sourceOrigin,
      sourceMode: provider.sourceMode,
      mode: configured ? 'tavily_basic' : 'unconfigured',
      model: null,
      costModel: configured ? 'tavily_basic_search_1_credit_per_request' : 'unconfigured',
      dailyRequestCap: Number.isInteger(provider.dailyCreditCap) ? Number(provider.dailyCreditCap) : 8,
      requestsUsedThisRun: requestsUsed,
      searchQueriesUsedThisRun: requestsUsed,
      attemptedSessions: Number.isInteger(provider.attemptedSessions) ? Number(provider.attemptedSessions) : requestsUsed,
      successfulSearches: Number.isInteger(provider.successfulSearches) ? Number(provider.successfulSearches) : 0,
      failedSearches: Number.isInteger(provider.failedSearches) ? Number(provider.failedSearches) : 0,
      note: typeof provider.note === 'string' ? provider.note : 'Legacy Tavily discovery artifact normalized for display.',
    },
    sessions,
  };
}

export const GameplayDiscoverySchema = z.preprocess(normalizeLegacyDiscovery, GameplayDiscoveryV2Schema);

export type GameplaySourceCandidate = z.infer<typeof GameplaySourceCandidateSchema>;
export type GameplayDiscoverySession = z.infer<typeof GameplayDiscoverySessionSchema>;
export type GameplayDiscovery = z.infer<typeof GameplayDiscoverySchema>;

export function discoveryForSession(discovery: GameplayDiscovery | null, sessionId: string) {
  return discovery?.sessions.find((session) => session.sessionId === sessionId) ?? null;
}

export async function loadGameplayDiscovery(): Promise<GameplayDiscovery> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/discovery/latest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Gameplay source discovery request failed (${response.status}).`);
  return GameplayDiscoverySchema.parse(await response.json());
}
