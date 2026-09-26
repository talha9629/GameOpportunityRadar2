import fs from 'node:fs';
import path from 'node:path';

const queuePath = path.resolve('public/data/research/latest.json');
const endpoint = process.env.RADAR_ANALYZE_ENDPOINT?.trim();
const publishableKey = process.env.RADAR_PUBLISHABLE_KEY?.trim();
const maxPacks = Math.max(0, Math.min(8, Number.parseInt(process.env.RADAR_EVIDENCE_PACK_CAP ?? '8', 10) || 8));

if (!endpoint || !publishableKey) throw new Error('RADAR_ANALYZE_ENDPOINT and RADAR_PUBLISHABLE_KEY are required.');
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
if (!Array.isArray(queue?.candidates)) throw new Error('Research queue is missing candidates.');

function compactFinding(finding) {
  return {
    key: String(finding?.key ?? ''),
    label: String(finding?.label ?? ''),
    value: String(finding?.value ?? ''),
    origin: String(finding?.origin ?? ''),
    interpretation: String(finding?.interpretation ?? ''),
    coverage: String(finding?.coverage ?? ''),
    confidence: typeof finding?.confidence === 'number' ? finding.confidence : null,
    evidenceLabel: String(finding?.evidenceLabel ?? ''),
  };
}

function validateResponse(candidate, body) {
  const failures = [];
  if (String(body?.game?.storeId) !== candidate.appId) failures.push('storeId mismatch');
  if (body?.game?.platform !== 'ios') failures.push('platform is not ios');
  if (!Array.isArray(body?.findings) || body.findings.length < 5) failures.push('too few findings');
  if (!Array.isArray(body?.unknowns) || body.unknowns.length < 5) failures.push('unknowns missing');
  if (typeof body?.sourceObservedAt !== 'string' || Number.isNaN(Date.parse(body.sourceObservedAt))) failures.push('invalid sourceObservedAt');
  if (body?.sourceMode !== 'automated') failures.push('unexpected sourceMode');
  if (Array.isArray(body?.findings) && body.findings.some((finding) => typeof finding?.evidenceLabel !== 'string' || finding.evidenceLabel.length < 10)) failures.push('finding missing evidence label');
  const serialized = JSON.stringify(body);
  if (/downloads? estimated from rank|revenue estimated from rank|percent of players/i.test(serialized)) failures.push('forbidden population/performance claim');
  return failures;
}

async function analyzeCandidate(candidate) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: candidate.appId, mode: 'analyze' }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  const failures = validateResponse(candidate, body);
  if (failures.length) throw new Error(failures.join('; '));

  const findings = body.findings.map(compactFinding);
  const listingFindings = findings.filter((finding) => finding.key.startsWith('listing_'));
  const verifiedDirectFindings = findings.filter((finding) => finding.interpretation === 'direct' && finding.coverage === 'verified');

  return {
    source: 'live_analyze_game',
    sourceOrigin: 'official_public',
    sourceMode: body.sourceMode,
    observedAt: body.sourceObservedAt,
    endpointClass: 'Radar Supabase Edge Function → Apple Lookup',
    canonicalName: body.game.canonicalName,
    publisher: body.game.publisher,
    findingCount: findings.length,
    unknownCount: body.unknowns.length,
    verifiedDirectFindingCount: verifiedDirectFindings.length,
    listingFindingCount: listingFindings.length,
    findings,
    unknowns: body.unknowns.map((value) => String(value)),
    nextAction: body.unknowns.length > 0
      ? 'Resolve the highest-impact unknowns with competitor mapping, review evidence or Deep Verify before changing the prototype decision.'
      : 'No explicit unknowns were returned; audit evidence coverage before changing the prototype decision.',
  };
}

const failures = [];
let succeeded = 0;
let attempted = 0;
for (let index = 0; index < queue.candidates.length; index += 1) {
  const candidate = queue.candidates[index];
  if (index >= maxPacks) {
    candidate.analysisEvidence = null;
    continue;
  }
  attempted += 1;
  try {
    candidate.analysisEvidence = await analyzeCandidate(candidate);
    succeeded += 1;
    console.log(`[evidence-pack] PASS #${candidate.queueRank} ${candidate.name} · ${candidate.analysisEvidence.findingCount} findings · ${candidate.analysisEvidence.unknownCount} unknowns`);
  } catch (error) {
    candidate.analysisEvidence = null;
    failures.push({ appId: candidate.appId, name: candidate.name, error: String(error) });
    console.error(`[evidence-pack] FAIL #${candidate.queueRank} ${candidate.name} · ${String(error)}`);
  }
}

queue.sources.liveAnalyzer = {
  status: attempted === 0 ? 'disabled' : succeeded === attempted ? 'complete' : succeeded > 0 ? 'partial' : 'failed',
  origin: 'official_public',
  endpoint,
  cap: maxPacks,
  attempted,
  succeeded,
  failures,
  note: 'Compact evidence packs come from the live Radar analyzer backed by Apple store metadata. They do not gameplay-verify mechanics or infer downloads/revenue.',
};
queue.generatedAt = new Date().toISOString();

fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
if (queue.radarDate) {
  fs.mkdirSync(path.resolve('public/data/research/history'), { recursive: true });
  fs.writeFileSync(path.resolve('public/data/research/history', `${queue.radarDate}.json`), `${JSON.stringify(queue, null, 2)}\n`);
}

console.log(`[evidence-pack] ${succeeded}/${attempted} successful · status ${queue.sources.liveAnalyzer.status}`);
if (attempted > 0 && succeeded === 0) process.exitCode = 1;
