import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'npm:jose@6.1.0';
import { z } from 'npm:zod@4.1.11';

const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_JWKS = createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
const OIDC_AUDIENCE = 'game-opportunity-radar-discovery';
const EXPECTED_REPOSITORY = 'talha9629/GameOpportunityRadar2';
const EXPECTED_REPOSITORY_ID = '1388675155';
const EXPECTED_REF = 'refs/heads/main';
const EXPECTED_WORKFLOW_REF = 'talha9629/GameOpportunityRadar2/.github/workflows/apple-radar.yml@refs/heads/main';
const EXPECTED_WORKFLOW = 'Apple Radar';
const ALLOWED_EVENTS = new Set(['push', 'schedule', 'workflow_dispatch']);
const MAX_SESSIONS = 8;
const MAX_CANDIDATES = 3;

const SessionSchema = z.object({
  sessionId: z.string().regex(/^[a-f0-9]{24}$/),
  appId: z.string().trim().min(5).max(40),
  name: z.string().trim().min(1).max(160),
  queueRank: z.number().int().positive().max(100),
});

const InputSchema = z.object({
  sessions: z.array(SessionSchema).min(1).max(MAX_SESSIONS),
});

type DiscoverySession = z.infer<typeof SessionSchema>;

type AuthorizedClaims = JWTPayload & {
  repository?: string;
  repository_id?: string;
  ref?: string;
  ref_type?: string;
  workflow?: string;
  workflow_ref?: string;
  event_name?: string;
  runner_environment?: string;
  run_id?: string;
  run_number?: string;
  run_attempt?: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function bearerToken(req: Request) {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

function assertAuthorizedClaims(payload: AuthorizedClaims) {
  const checks: Array<[boolean, string]> = [
    [payload.repository === EXPECTED_REPOSITORY, 'repository'],
    [String(payload.repository_id ?? '') === EXPECTED_REPOSITORY_ID, 'repository_id'],
    [payload.ref === EXPECTED_REF, 'ref'],
    [payload.ref_type === 'branch', 'ref_type'],
    [payload.workflow === EXPECTED_WORKFLOW, 'workflow'],
    [payload.workflow_ref === EXPECTED_WORKFLOW_REF, 'workflow_ref'],
    [payload.runner_environment === 'github-hosted', 'runner_environment'],
    [typeof payload.event_name === 'string' && ALLOWED_EVENTS.has(payload.event_name), 'event_name'],
  ];
  const failed = checks.find(([ok]) => !ok)?.[1];
  if (failed) throw new Error(`GitHub OIDC claim rejected: ${failed}`);
}

async function authorizeGithub(req: Request) {
  const token = bearerToken(req);
  if (!token) throw new Error('Missing GitHub OIDC bearer token');
  const { payload, protectedHeader } = await jwtVerify(token, GITHUB_JWKS, {
    issuer: GITHUB_ISSUER,
    audience: OIDC_AUDIENCE,
    algorithms: ['RS256'],
    clockTolerance: 5,
  });
  if (protectedHeader.alg !== 'RS256') throw new Error('Unexpected GitHub OIDC signing algorithm');
  assertAuthorizedClaims(payload as AuthorizedClaims);
  return payload as AuthorizedClaims;
}

function canonicalYoutubeUrl(value: unknown) {
  try {
    const url = new URL(String(value ?? '').trim().replace(/[),.\]}>'"]+$/g, ''));
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') {
      const videoId = url.pathname.split('/').filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : null;
    }
    if (host !== 'youtube.com' || url.pathname !== '/watch') return null;
    const videoId = url.searchParams.get('v');
    return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : null;
  } catch {
    return null;
  }
}

function extractYoutubeUrls(text: unknown) {
  const matches = String(text ?? '').match(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?[^\s<>)\]]+|youtu\.be\/[^\s<>)\]]+)/gi) ?? [];
  return [...new Set(matches.map(canonicalYoutubeUrl).filter((value): value is string => Boolean(value)))];
}

function queryFor(session: DiscoverySession) {
  return `"${session.name}" gameplay walkthrough menu monetization progression`;
}

function promptFor(session: DiscoverySession) {
  return [
    `Use Google Search to find public YouTube gameplay footage for the exact mobile game: ${session.name}.`,
    `Apple app ID context: ${session.appId}.`,
    'Prefer full gameplay, walkthrough, menus, progression, monetization, or first-session footage.',
    'Return at most 6 direct public YouTube watch URLs, one URL per line.',
    'Do not invent URLs. Do not include commentary, markdown links, channel pages, Shorts URLs, search pages, or non-YouTube URLs.',
    `Search intent: ${queryFor(session)}`,
  ].join('\n');
}

async function verifyPublicYoutube(url: string) {
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('format', 'json');
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'GameOpportunityRadar2-OIDC-Discovery/1.0' },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const title = cleanText(payload?.title, 300);
  if (!title) return null;
  return {
    title,
    channelName: cleanText(payload?.author_name, 180) || null,
    thumbnailUrl: typeof payload?.thumbnail_url === 'string' ? payload.thumbnail_url : null,
    availabilityVerifiedAt: new Date().toISOString(),
  };
}

async function groundedSearch(session: DiscoverySession, apiKey: string, model: string) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'GameOpportunityRadar2-OIDC-Discovery/1.0',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptFor(session) }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0 },
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini Search HTTP ${response.status}${body ? `: ${cleanText(body, 300)}` : ''}`);
  }

  const payload = await response.json();
  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
  const text = Array.isArray(candidate?.content?.parts)
    ? candidate.content.parts.map((part: Record<string, unknown>) => typeof part?.text === 'string' ? part.text : '').join('\n')
    : '';
  const grounding = candidate?.groundingMetadata ?? {};
  const searchQueries = Array.isArray(grounding?.webSearchQueries)
    ? grounding.webSearchQueries.map((item: unknown) => cleanText(item, 300)).filter(Boolean).slice(0, 20)
    : [];
  const groundingUrls = (Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [])
    .map((chunk: Record<string, unknown>) => canonicalYoutubeUrl((chunk?.web as Record<string, unknown> | undefined)?.uri))
    .filter((value: string | null): value is string => Boolean(value));
  const urls = [...new Set([...extractYoutubeUrls(text), ...groundingUrls])];

  const candidates = [];
  for (const url of urls) {
    const verified = await verifyPublicYoutube(url);
    if (!verified) continue;
    candidates.push({
      rank: candidates.length + 1,
      url,
      title: verified.title,
      snippet: 'Suggested by Gemini Google Search grounding. Public availability is checked separately through YouTube oEmbed; content is not inspected by discovery.',
      score: null,
      channelName: verified.channelName,
      thumbnailUrl: verified.thumbnailUrl,
      availabilityVerifiedAt: verified.availabilityVerifiedAt,
      discoveryProvider: 'gemini_google_search',
      domain: 'youtube.com',
      sourceOrigin: 'third_party_public',
      interpretation: 'search_candidate',
      reviewState: 'suggested',
    });
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  return { searchQueries, candidates };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  let claims: AuthorizedClaims;
  try {
    claims = await authorizeGithub(req);
  } catch (error) {
    console.warn('[github-gameplay-discovery] auth rejected', error instanceof Error ? error.message : String(error));
    return json({ error: 'AUTH_REQUIRED' }, 401);
  }

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await req.json());
  } catch (error) {
    return json({ error: 'INVALID_REQUEST', details: error instanceof Error ? error.message : 'Invalid request' }, 400);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY')?.trim() ?? '';
  if (!apiKey) return json({ error: 'PROVIDER_UNCONFIGURED' }, 503);
  const model = Deno.env.get('GEMINI_DISCOVERY_MODEL')?.trim() || 'gemini-3.8-flash';

  const sessions = [];
  let successfulSearches = 0;
  let failedSearches = 0;
  let searchQueriesUsed = 0;

  for (const session of input.sessions) {
    const item = {
      sessionId: session.sessionId,
      appId: session.appId,
      name: session.name,
      queueRank: session.queueRank,
      query: queryFor(session),
      providerKey: 'gemini_google_search',
      searchQueries: [] as string[],
      searchedAt: new Date().toISOString(),
      status: 'no_result',
      candidates: [] as Array<Record<string, unknown>>,
      error: null as string | null,
    };
    try {
      const result = await groundedSearch(session, apiKey, model);
      item.searchQueries = result.searchQueries;
      item.candidates = result.candidates;
      item.status = result.candidates.length > 0 ? 'found' : 'no_result';
      searchQueriesUsed += result.searchQueries.length;
      successfulSearches += 1;
    } catch (error) {
      item.status = 'search_failed';
      item.error = cleanText(error instanceof Error ? error.message : String(error), 500);
      failedSearches += 1;
    }
    sessions.push(item);
  }

  return json({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider: {
      key: 'gemini_google_search',
      name: 'Gemini Search',
      status: failedSearches === 0 ? 'complete' : successfulSearches > 0 ? 'partial' : 'failed',
      model,
      credentialMode: 'github_oidc_supabase_proxy',
      requestsUsedThisRun: input.sessions.length,
      searchQueriesUsedThisRun: searchQueriesUsed,
      attemptedSessions: input.sessions.length,
      successfulSearches,
      failedSearches,
    },
    github: {
      repository: claims.repository,
      repositoryId: String(claims.repository_id ?? ''),
      ref: claims.ref,
      workflowRef: claims.workflow_ref,
      eventName: claims.event_name,
      runId: String(claims.run_id ?? ''),
      runNumber: String(claims.run_number ?? ''),
      runAttempt: String(claims.run_attempt ?? ''),
    },
    sessions,
  });
});
