import fs from 'node:fs';
import path from 'node:path';

const verificationPath = path.resolve('public/data/verification/latest.json');
const outputDir = path.resolve('public/data/discovery');
const outputPath = path.join(outputDir, 'latest.json');
const apiKey = String(process.env.TAVILY_API_KEY ?? '').trim();
const dailyCreditCap = 8;
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
    const url = new URL(value);
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

async function tavilySearch(query) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'GameOpportunityRadar2/1.0',
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
  return response.json();
}

const verification = readJson(verificationPath);
const sessions = Array.isArray(verification.captureSessions) ? verification.captureSessions : [];
const output = {
  schemaVersion: 1,
  generatedAt,
  verificationGeneratedAt: verification.generatedAt ?? null,
  statement: 'Public gameplay discovery proposes search candidates only. A URL is not gameplay evidence until it is saved into Deep Verify, analyzed or inspected, and its timestamped findings receive explicit human review.',
  provider: {
    name: 'Tavily',
    status: apiKey ? 'complete' : 'unconfigured',
    sourceOrigin: 'third_party_public_search',
    sourceMode: 'assisted',
    searchDepth: 'basic',
    creditModel: 'basic_search_1_credit_per_request',
    dailyCreditCap,
    creditsUsedThisRun: 0,
    attemptedSessions: 0,
    successfulSearches: 0,
    failedSearches: 0,
    note: apiKey
      ? 'Search candidates are domain-filtered to public YouTube URLs and never become verified evidence automatically.'
      : 'TAVILY_API_KEY is not configured. Gameplay discovery is optional and the verification queue remains usable without it.',
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
    searchedAt: null,
    status: apiKey ? 'no_result' : 'unconfigured',
    candidates: [],
    error: null,
  };

  if (!apiKey || output.provider.creditsUsedThisRun >= dailyCreditCap) {
    output.sessions.push(base);
    continue;
  }

  output.provider.attemptedSessions += 1;
  output.provider.creditsUsedThisRun += 1;
  base.searchedAt = new Date().toISOString();

  try {
    const result = await tavilySearch(base.query);
    const seen = new Set();
    for (const item of Array.isArray(result?.results) ? result.results : []) {
      const url = canonicalYoutubeUrl(item?.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      base.candidates.push({
        rank: base.candidates.length + 1,
        url,
        title: cleanText(item?.title, 300) || 'Untitled YouTube result',
        snippet: cleanText(item?.content, 700),
        score: Number.isFinite(item?.score) ? Math.max(0, Math.min(1, Number(item.score))) : null,
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

if (apiKey) {
  if (output.provider.attemptedSessions === 0) output.provider.status = 'complete';
  else if (output.provider.failedSearches === 0) output.provider.status = 'complete';
  else if (output.provider.successfulSearches > 0) output.provider.status = 'partial';
  else output.provider.status = 'failed';
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`[gameplay-discovery] ${output.provider.status} · sessions ${output.sessions.length} · searches ${output.provider.attemptedSessions}/${dailyCreditCap} · candidates ${output.sessions.reduce((sum, session) => sum + session.candidates.length, 0)}`);
