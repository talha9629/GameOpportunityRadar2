import fs from 'node:fs';
import path from 'node:path';

const verificationPath = path.resolve('public/data/verification/latest.json');
const outputDir = path.resolve('public/data/discovery');
const outputPath = path.join(outputDir, 'latest.json');
const tavilyKey = String(process.env.TAVILY_API_KEY ?? '').trim();
const geminiKey = String(process.env.GEMINI_API_KEY ?? '').trim();
const geminiModel = String(process.env.GEMINI_DISCOVERY_MODEL ?? 'gemini-3.8-flash').trim() || 'gemini-3.8-flash';
const dailyRequestCap = 8;
const maxCandidatesPerSession = 3;
const generatedAt = new Date().toISOString();

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function canonicalYoutubeUrl(value) {
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

function queryFor(session) {
  return `"${session.name}" gameplay walkthrough menu monetization progression`;
}

function extractYoutubeUrls(text) {
  const matches = String(text ?? '').match(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?[^\s<>)\]]+|youtu\.be\/[^\s<>)\]]+)/gi) ?? [];
  const seen = new Set();
  const urls = [];
  for (const match of matches) {
    const url = canonicalYoutubeUrl(match);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

async function verifyPublicYoutube(url) {
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('format', 'json');
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'GameOpportunityRadar2/1.1' },
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

async function tavilySearch(query) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tavilyKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'GameOpportunityRadar2/1.1',
    },
    body: JSON.stringify({
      query,
      topic: 'general',
      search_depth: 'basic',
      max_results: 6,
      include_domains: ['youtube.com', 'youtu.be'],
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Tavily HTTP ${response.status}${body ? `: ${cleanText(body, 220)}` : ''}`);
  }
  const payload = await response.json();
  return {
    searchQueries: [query],
    items: (Array.isArray(payload?.results) ? payload.results : []).map((item) => ({
      url: item?.url,
      title: cleanText(item?.title, 300),
      snippet: cleanText(item?.content, 700),
      score: Number.isFinite(item?.score) ? Math.max(0, Math.min(1, Number(item.score))) : null,
    })),
  };
}

async function geminiGroundedSearch(query, gameName) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  const prompt = [
    `Use Google Search to find public YouTube gameplay footage for the exact mobile game: ${gameName}.`,
    'Prefer full gameplay, walkthrough, menu, progression, monetization, or first-session footage.',
    'Return at most 6 direct public YouTube watch URLs, one URL per line.',
    'Do not invent URLs. Do not include commentary, markdown links, channel pages, Shorts URLs, search pages, or non-YouTube URLs.',
    `Search intent: ${query}`,
  ].join('\n');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-goog-api-key': geminiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'GameOpportunityRadar2/1.1',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
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
    ? candidate.content.parts.map((part) => typeof part?.text === 'string' ? part.text : '').join('\n')
    : '';
  const grounding = candidate?.groundingMetadata ?? {};
  const searchQueries = Array.isArray(grounding?.webSearchQueries)
    ? grounding.webSearchQueries.map((item) => cleanText(item, 300)).filter(Boolean).slice(0, 20)
    : [];

  const candidateUrls = extractYoutubeUrls(text);
  const groundingUrls = (Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [])
    .map((chunk) => canonicalYoutubeUrl(chunk?.web?.uri))
    .filter(Boolean);

  const urls = [...new Set([...candidateUrls, ...groundingUrls])];
  return {
    searchQueries,
    items: urls.map((url) => ({
      url,
      title: '',
      snippet: 'Suggested by Gemini Google Search grounding. Public availability is checked separately through YouTube oEmbed; content is not inspected by discovery.',
      score: null,
    })),
  };
}

const providerKey = tavilyKey ? 'tavily' : geminiKey ? 'gemini_google_search' : 'none';
const providerName = providerKey === 'tavily' ? 'Tavily' : providerKey === 'gemini_google_search' ? 'Gemini Search' : 'None';
const providerMode = providerKey === 'tavily' ? 'tavily_basic' : providerKey === 'gemini_google_search' ? 'gemini_google_search_grounding' : 'unconfigured';
const costModel = providerKey === 'tavily'
  ? 'tavily_basic_search_1_credit_per_request'
  : providerKey === 'gemini_google_search'
    ? 'gemini_3_search_queries_reported_by_grounding_metadata'
    : 'unconfigured';

const verification = readJson(verificationPath);
const sessions = Array.isArray(verification.captureSessions) ? verification.captureSessions : [];
const output = {
  schemaVersion: 2,
  generatedAt,
  verificationGeneratedAt: verification.generatedAt ?? null,
  statement: 'Public gameplay discovery proposes search candidates only. A URL is not gameplay evidence until it is saved into Deep Verify, analyzed or inspected, and its timestamped findings receive explicit human review.',
  provider: {
    key: providerKey,
    name: providerName,
    status: providerKey === 'none' ? 'unconfigured' : 'complete',
    sourceOrigin: 'third_party_public_search',
    sourceMode: 'assisted',
    mode: providerMode,
    model: providerKey === 'gemini_google_search' ? geminiModel : null,
    costModel,
    dailyRequestCap,
    requestsUsedThisRun: 0,
    searchQueriesUsedThisRun: 0,
    attemptedSessions: 0,
    successfulSearches: 0,
    failedSearches: 0,
    note: providerKey === 'tavily'
      ? 'Tavily Basic search is domain-filtered to YouTube. Every stored candidate is then confirmed public through YouTube oEmbed; discovery never verifies gameplay content.'
      : providerKey === 'gemini_google_search'
        ? 'Gemini uses Google Search grounding. Radar records the actual webSearchQueries reported by grounding metadata and confirms each stored YouTube candidate is public through YouTube oEmbed; discovery never verifies gameplay content.'
        : 'Neither TAVILY_API_KEY nor GEMINI_API_KEY is configured in GitHub Actions. Gameplay discovery is optional and the verification queue remains usable without it.',
  },
  sessions: [],
};

for (const session of sessions) {
  const base = {
    sessionId: session.sessionId,
    appId: session.appId,
    name: session.name,
    queueRank: session.queueRank,
    query: queryFor(session),
    providerKey,
    searchQueries: [],
    searchedAt: null,
    status: providerKey === 'none' ? 'unconfigured' : 'no_result',
    candidates: [],
    error: null,
  };

  if (providerKey === 'none' || output.provider.requestsUsedThisRun >= dailyRequestCap) {
    output.sessions.push(base);
    continue;
  }

  output.provider.attemptedSessions += 1;
  output.provider.requestsUsedThisRun += 1;
  base.searchedAt = new Date().toISOString();

  try {
    const result = providerKey === 'tavily'
      ? await tavilySearch(base.query)
      : await geminiGroundedSearch(base.query, session.name);
    base.searchQueries = result.searchQueries;
    output.provider.searchQueriesUsedThisRun += result.searchQueries.length;

    const seen = new Set();
    for (const item of result.items) {
      const url = canonicalYoutubeUrl(item?.url);
      if (!url || seen.has(url)) continue;
      const verified = await verifyPublicYoutube(url);
      if (!verified) continue;
      seen.add(url);
      base.candidates.push({
        rank: base.candidates.length + 1,
        url,
        title: verified.title || cleanText(item?.title, 300) || 'Untitled YouTube result',
        snippet: cleanText(item?.snippet, 700),
        score: Number.isFinite(item?.score) ? Math.max(0, Math.min(1, Number(item.score))) : null,
        channelName: verified.channelName,
        thumbnailUrl: verified.thumbnailUrl,
        availabilityVerifiedAt: verified.availabilityVerifiedAt,
        discoveryProvider: providerKey,
        domain: 'youtube.com',
        sourceOrigin: 'third_party_public',
        interpretation: 'search_candidate',
        reviewState: 'suggested',
      });
      if (base.candidates.length >= maxCandidatesPerSession) break;
    }
    base.status = base.candidates.length > 0 ? 'found' : 'no_result';
    output.provider.successfulSearches += 1;
  } catch (error) {
    base.status = 'search_failed';
    base.error = cleanText(error instanceof Error ? error.message : String(error), 500);
    output.provider.failedSearches += 1;
  }

  output.sessions.push(base);
}

if (providerKey !== 'none') {
  if (output.provider.attemptedSessions === 0) output.provider.status = 'complete';
  else if (output.provider.failedSearches === 0) output.provider.status = 'complete';
  else if (output.provider.successfulSearches > 0) output.provider.status = 'partial';
  else output.provider.status = 'failed';
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`[gameplay-discovery] ${output.provider.name} ${output.provider.status} · sessions ${output.sessions.length} · requests ${output.provider.requestsUsedThisRun}/${dailyRequestCap} · reported search queries ${output.provider.searchQueriesUsedThisRun} · candidates ${output.sessions.reduce((sum, session) => sum + session.candidates.length, 0)}`);
