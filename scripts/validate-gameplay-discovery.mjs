import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('public/data/discovery/latest.json');
const discovery = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function isCanonicalYoutube(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'www.youtube.com'
      && url.pathname === '/watch'
      && Boolean(url.searchParams.get('v'));
  } catch {
    return false;
  }
}

const providerKeys = new Set(['tavily', 'gemini_google_search', 'none']);
const expectedNames = {
  tavily: 'Tavily',
  gemini_google_search: 'Gemini Search',
  none: 'None',
};
const expectedModes = {
  tavily: 'tavily_basic',
  gemini_google_search: 'gemini_google_search_grounding',
  none: 'unconfigured',
};

assert(discovery.schemaVersion === 2, 'schemaVersion must be 2');
assert(typeof discovery.generatedAt === 'string' && !Number.isNaN(Date.parse(discovery.generatedAt)), 'generatedAt must be an ISO date');
assert(typeof discovery.verificationGeneratedAt === 'string' && !Number.isNaN(Date.parse(discovery.verificationGeneratedAt)), 'verificationGeneratedAt must be an ISO date');
assert(/search candidates only/i.test(discovery.statement ?? ''), 'statement must clearly say discovery candidates are not evidence');
assert(providerKeys.has(discovery.provider?.key), 'invalid provider key');
assert(discovery.provider?.name === expectedNames[discovery.provider?.key], 'provider name does not match provider key');
assert(discovery.provider?.mode === expectedModes[discovery.provider?.key], 'provider mode does not match provider key');
assert(['unconfigured', 'complete', 'partial', 'failed'].includes(discovery.provider?.status), 'invalid provider status');
assert(discovery.provider?.sourceOrigin === 'third_party_public_search', 'provider provenance must be third_party_public_search');
assert(discovery.provider?.sourceMode === 'assisted', 'provider mode must remain assisted');
assert(typeof discovery.provider?.costModel === 'string' && discovery.provider.costModel.length >= 10, 'provider costModel must be explicit');
assert(Number.isInteger(discovery.provider?.dailyRequestCap) && discovery.provider.dailyRequestCap >= 0 && discovery.provider.dailyRequestCap <= 8, 'daily request cap must be 0..8');
assert(Number.isInteger(discovery.provider?.requestsUsedThisRun) && discovery.provider.requestsUsedThisRun >= 0 && discovery.provider.requestsUsedThisRun <= discovery.provider.dailyRequestCap, 'requests used exceed hard request cap');
assert(Number.isInteger(discovery.provider?.searchQueriesUsedThisRun) && discovery.provider.searchQueriesUsedThisRun >= 0, 'search query count must be non-negative');
assert(discovery.provider?.attemptedSessions === discovery.provider?.requestsUsedThisRun, 'one provider request must correspond to each attempted session');
assert(discovery.provider?.attemptedSessions === (discovery.provider?.successfulSearches ?? 0) + (discovery.provider?.failedSearches ?? 0), 'successful + failed searches must equal attempted sessions');
assert(Array.isArray(discovery.sessions) && discovery.sessions.length <= 8, 'discovery sessions must be an array capped at 8');

if (discovery.provider?.key === 'tavily') {
  assert(discovery.provider.model == null, 'Tavily provider must not declare a Gemini model');
  assert(discovery.provider.searchQueriesUsedThisRun === discovery.provider.requestsUsedThisRun, 'Tavily Basic should record one search query per request');
  assert(discovery.provider.costModel === 'tavily_basic_search_1_credit_per_request', 'unexpected Tavily cost model');
}
if (discovery.provider?.key === 'gemini_google_search') {
  assert(typeof discovery.provider.model === 'string' && discovery.provider.model.startsWith('gemini-'), 'Gemini provider must declare the model');
  assert(discovery.provider.costModel === 'gemini_3_search_queries_reported_by_grounding_metadata', 'unexpected Gemini search cost model');
}
if (discovery.provider?.key === 'none') {
  assert(discovery.provider.status === 'unconfigured', 'none provider must be unconfigured');
  assert(discovery.provider.model == null, 'none provider cannot declare a model');
  assert(discovery.provider.requestsUsedThisRun === 0 && discovery.provider.searchQueriesUsedThisRun === 0, 'unconfigured provider cannot consume requests or searches');
}

const sessionIds = new Set();
let candidateCount = 0;
let searchQueryCount = 0;
let searchedSessionCount = 0;
for (const session of discovery.sessions ?? []) {
  assert(/^[a-f0-9]{24}$/.test(session.sessionId ?? ''), `invalid sessionId ${session.sessionId}`);
  assert(!sessionIds.has(session.sessionId), `duplicate session ${session.sessionId}`);
  sessionIds.add(session.sessionId);
  assert(typeof session.appId === 'string' && session.appId.length >= 5, `${session.sessionId} has invalid appId`);
  assert(typeof session.name === 'string' && session.name.trim().length > 0, `${session.sessionId} has invalid name`);
  assert(typeof session.query === 'string' && session.query.length >= 10, `${session.sessionId} has invalid query`);
  assert(session.providerKey === discovery.provider.key, `${session.sessionId} providerKey does not match run provider`);
  assert(Array.isArray(session.searchQueries) && session.searchQueries.length <= 20, `${session.sessionId} has invalid searchQueries`);
  session.searchQueries.forEach((query) => assert(typeof query === 'string' && query.length > 0 && query.length <= 300, `${session.sessionId} contains invalid search query metadata`));
  searchQueryCount += session.searchQueries.length;
  assert(['found', 'no_result', 'search_failed', 'unconfigured'].includes(session.status), `${session.sessionId} has invalid status`);
  assert(Array.isArray(session.candidates) && session.candidates.length <= 3, `${session.sessionId} exceeds candidate cap`);
  if (session.status === 'found') assert(session.candidates.length > 0, `${session.sessionId} found status requires candidates`);
  if (session.status === 'unconfigured') assert(session.candidates.length === 0 && session.searchedAt == null && session.searchQueries.length === 0, `${session.sessionId} unconfigured session cannot contain search output`);
  if (session.status === 'search_failed') assert(typeof session.error === 'string' && session.error.length > 0, `${session.sessionId} search_failed requires an error`);
  if (session.searchedAt != null) {
    assert(!Number.isNaN(Date.parse(session.searchedAt)), `${session.sessionId} searchedAt must be an ISO date`);
    searchedSessionCount += 1;
  }
  candidateCount += session.candidates.length;
  session.candidates.forEach((candidate, index) => {
    assert(candidate.rank === index + 1, `${session.sessionId} candidate ranks must be contiguous`);
    assert(isCanonicalYoutube(candidate.url), `${session.sessionId} contains non-canonical/non-YouTube URL`);
    assert(candidate.domain === 'youtube.com', `${session.sessionId} candidate domain must be youtube.com`);
    assert(candidate.sourceOrigin === 'third_party_public', `${session.sessionId} candidate provenance must be third_party_public`);
    assert(candidate.interpretation === 'search_candidate', `${session.sessionId} candidate interpretation must remain search_candidate`);
    assert(candidate.reviewState === 'suggested', `${session.sessionId} candidate reviewState must remain suggested`);
    assert(candidate.discoveryProvider === discovery.provider.key, `${session.sessionId} candidate provider provenance mismatch`);
    assert(typeof candidate.title === 'string' && candidate.title.length > 0 && candidate.title.length <= 300, `${session.sessionId} candidate title invalid`);
    assert(candidate.score == null || (typeof candidate.score === 'number' && candidate.score >= 0 && candidate.score <= 1), `${session.sessionId} candidate score out of bounds`);
    assert(typeof candidate.availabilityVerifiedAt === 'string' && !Number.isNaN(Date.parse(candidate.availabilityVerifiedAt)), `${session.sessionId} candidate lacks valid YouTube availability verification`);
    assert(candidate.channelName == null || (typeof candidate.channelName === 'string' && candidate.channelName.length <= 180), `${session.sessionId} candidate channelName invalid`);
    assert(candidate.thumbnailUrl == null || /^https:\/\//.test(candidate.thumbnailUrl), `${session.sessionId} candidate thumbnailUrl invalid`);
  });
}

assert(searchedSessionCount === discovery.provider?.attemptedSessions, 'searched session count must equal attemptedSessions');
assert(searchQueryCount === discovery.provider?.searchQueriesUsedThisRun, 'session searchQueries must sum to provider searchQueriesUsedThisRun');

if (discovery.provider?.status === 'unconfigured') {
  assert(discovery.provider.key === 'none', 'unconfigured status requires none provider');
  assert((discovery.sessions ?? []).every((session) => session.status === 'unconfigured'), 'unconfigured provider requires unconfigured session states');
}

const serialized = JSON.stringify(discovery);
assert(!/bearer\s+[a-z0-9._-]{10,}|tvly-[a-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{25,}/i.test(serialized), 'discovery artifact appears to contain secret token material');

if (errors.length) {
  console.error('[gameplay-discovery] validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[gameplay-discovery] validation PASS · ${discovery.provider.name} ${discovery.provider.status} · ${candidateCount} public YouTube candidate(s) · requests ${discovery.provider.requestsUsedThisRun}/${discovery.provider.dailyRequestCap} · reported search queries ${discovery.provider.searchQueriesUsedThisRun}`);
