import { z } from 'zod';

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
  searchedAt: z.string().nullable(),
  status: z.enum(['found', 'no_result', 'search_failed', 'unconfigured']),
  candidates: z.array(GameplaySourceCandidateSchema).max(3),
  error: z.string().nullable(),
}).superRefine((value, context) => {
  if (value.status === 'found' && value.candidates.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates'], message: 'Found discovery sessions require at least one candidate.' });
  }
  if (value.status === 'unconfigured' && (value.searchedAt !== null || value.candidates.length > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Unconfigured sessions cannot contain search output.' });
  }
});

export const GameplayDiscoverySchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  verificationGeneratedAt: z.string(),
  statement: z.string().min(40),
  provider: z.object({
    name: z.literal('Tavily'),
    status: z.enum(['unconfigured', 'complete', 'partial', 'failed']),
    sourceOrigin: z.literal('third_party_public_search'),
    sourceMode: z.literal('assisted'),
    searchDepth: z.literal('basic'),
    creditModel: z.literal('basic_search_1_credit_per_request'),
    dailyCreditCap: z.number().int().min(0).max(8),
    creditsUsedThisRun: z.number().int().min(0).max(8),
    attemptedSessions: z.number().int().min(0).max(8),
    successfulSearches: z.number().int().min(0).max(8),
    failedSearches: z.number().int().min(0).max(8),
    note: z.string().min(20),
  }),
  sessions: z.array(GameplayDiscoverySessionSchema).max(8),
}).superRefine((value, context) => {
  if (value.provider.creditsUsedThisRun > value.provider.dailyCreditCap) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['provider', 'creditsUsedThisRun'], message: 'Discovery credit usage exceeds the hard cap.' });
  }
  if (value.provider.attemptedSessions !== value.provider.creditsUsedThisRun) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['provider', 'attemptedSessions'], message: 'Basic-search attempts must match budgeted credits.' });
  }
});

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
