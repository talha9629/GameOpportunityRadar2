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

assert(discovery.schemaVersion === 1, 'schemaVersion must be 1');
assert(typeof discovery.generatedAt === 'string' && !Number.isNaN(Date.parse(discovery.generatedAt)), 'generatedAt must be an ISO date');
assert(typeof discovery.verificationGeneratedAt === 'string' && !Number.isNaN(Date.parse(discovery.verificationGeneratedAt)), 'verificationGeneratedAt must be an ISO date');
assert(/search candidates only/i.test(discovery.statement ?? ''), 'statement must clearly say discovery candidates are not evidence');
assert(discovery.provider?.name === 'Tavily', 'provider must be Tavily');
assert(['unconfigured', 'complete', 'partial', 'failed'].includes(discovery.provider?.status), 'invalid provider status');
assert(discovery.provider?.sourceOrigin === 'third_party_public_search', 'provider provenance must be third_party_public_search');
assert(discovery.provider?.sourceMode === 'assisted', 'provider mode must be assisted');
assert(discovery.provider?.searchDepth === 'basic', 'search depth must remain basic');
assert(discovery.provider?.creditModel === 'basic_search_1_credit_per_request', 'credit model must be explicit');
assert(Number.isInteger(discovery.provider?.dailyCreditCap) && discovery.provider.dailyCreditCap >= 0 && discovery.provider.dailyCreditCap <= 8, 'daily Tavily cap must be 0..8');
assert(Number.isInteger(discovery.provider?.creditsUsedThisRun) && discovery.provider.creditsUsedThisRun >= 0 && discovery.provider.creditsUsedThisRun <= discovery.provider.dailyCreditCap, 'credits used exceed hard cap');
assert(discovery.provider?.attemptedSessions === discovery.provider?.creditsUsedThisRun, 'basic search request count must equal budgeted credits');
assert(Array.isArray(discovery.sessions) && discovery.sessions.length <= 8, 'discovery sessions must be an array capped at 8');

const sessionIds = new Set();
let candidateCount = 0;
for (const session of discovery.sessions ?? []) {
  assert(/^[a-f0-9]{24}$/.test(session.sessionId ?? ''), `invalid sessionId ${session.sessionId}`);
  assert(!sessionIds.has(session.sessionId), `duplicate session ${session.sessionId}`);
  sessionIds.add(session.sessionId);
  assert(typeof session.appId === 'string' && session.appId.length >= 5, `${session.sessionId} has invalid appId`);
  assert(typeof session.name === 'string' && session.name.trim().length > 0, `${session.sessionId} has invalid name`);
  assert(typeof session.query === 'string' && session.query.length >= 10, `${session.sessionId} has invalid query`);
  assert(['found', 'no_result', 'search_failed', 'unconfigured'].includes(session.status), `${session.sessionId} has invalid status`);
  assert(Array.isArray(session.candidates) && session.candidates.length <= 3, `${session.sessionId} exceeds candidate cap`);
  if (session.status === 'found') assert(session.candidates.length > 0, `${session.sessionId} found status requires candidates`);
  if (session.status === 'unconfigured') assert(session.candidates.length === 0 && session.searchedAt == null, `${session.sessionId} unconfigured session cannot contain search output`);
  if (session.status === 'search_failed') assert(typeof session.error === 'string' && session.error.length > 0, `${session.sessionId} search_failed requires an error`);
  candidateCount += session.candidates.length;
  session.candidates.forEach((candidate, index) => {
    assert(candidate.rank === index + 1, `${session.sessionId} candidate ranks must be contiguous`);
    assert(isCanonicalYoutube(candidate.url), `${session.sessionId} contains non-canonical/non-YouTube URL`);
    assert(candidate.domain === 'youtube.com', `${session.sessionId} candidate domain must be youtube.com`);
    assert(candidate.sourceOrigin === 'third_party_public', `${session.sessionId} candidate provenance must be third_party_public`);
    assert(candidate.interpretation === 'search_candidate', `${session.sessionId} candidate interpretation must remain search_candidate`);
    assert(candidate.reviewState === 'suggested', `${session.sessionId} candidate reviewState must remain suggested`);
    assert(candidate.score == null || (typeof candidate.score === 'number' && candidate.score >= 0 && candidate.score <= 1), `${session.sessionId} candidate score out of bounds`);
  });
}

if (discovery.provider?.status === 'unconfigured') {
  assert(discovery.provider.creditsUsedThisRun === 0, 'unconfigured provider cannot use credits');
  assert((discovery.sessions ?? []).every((session) => session.status === 'unconfigured'), 'unconfigured provider requires unconfigured session states');
}

assert(!/api[_-]?key|bearer\s+[a-z0-9_-]{10,}/i.test(JSON.stringify(discovery)), 'discovery artifact appears to contain secret material');

if (errors.length) {
  console.error('[gameplay-discovery] validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[gameplay-discovery] validation PASS · ${discovery.provider.status} · ${candidateCount} source candidate(s) · ${discovery.provider.creditsUsedThisRun}/${discovery.provider.dailyCreditCap} credit budget`);
