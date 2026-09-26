import { writeFile } from 'node:fs/promises';

const endpoint = process.env.RADAR_ANALYZE_ENDPOINT;
const publishableKey = process.env.RADAR_PUBLISHABLE_KEY;
if (!endpoint || !publishableKey) throw new Error('RADAR_ANALYZE_ENDPOINT and RADAR_PUBLISHABLE_KEY are required.');

const cases = [
  { key: 'meowdoku', id: '6761760135', expectedName: /Meowdoku/i },
  { key: 'royal-smash', id: '6780891673', expectedName: /Royal Smash/i },
  { key: 'colony-flow', id: '6779167923', expectedName: /Colony Flow/i },
];

async function analyze(testCase) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: testCase.id, mode: 'analyze' }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${testCase.key}: analyze-game returned ${response.status}: ${JSON.stringify(body)}`);

  const failures = [];
  if (String(body?.game?.storeId) !== testCase.id) failures.push('wrong storeId');
  if (!testCase.expectedName.test(String(body?.game?.canonicalName ?? ''))) failures.push('unexpected canonicalName');
  if (body?.game?.platform !== 'ios') failures.push('platform is not ios');
  if (!Array.isArray(body?.findings) || body.findings.length < 5) failures.push('too few findings');
  if (!Array.isArray(body?.unknowns) || body.unknowns.length < 5) failures.push('unknowns are not explicit enough');
  if (!body?.rawSource || typeof body.rawSource !== 'object') failures.push('raw Apple source missing');
  if (typeof body?.sourceObservedAt !== 'string' || Number.isNaN(Date.parse(body.sourceObservedAt))) failures.push('sourceObservedAt missing/invalid');
  if (body?.sourceMode !== 'automated') failures.push('sourceMode is not automated');

  const evidenceLabels = Array.isArray(body?.findings) ? body.findings.map((finding) => finding?.evidenceLabel) : [];
  if (evidenceLabels.some((label) => typeof label !== 'string' || label.length < 10)) failures.push('finding without inspectable evidence label');

  const listingFindings = Array.isArray(body?.findings)
    ? body.findings.filter((finding) => String(finding?.key ?? '').startsWith('listing_'))
    : [];
  if (listingFindings.length === 0) failures.push('no listing-derived feature finding');

  const forbiddenPopulationClaims = JSON.stringify(body).match(/downloads? estimated from rank|revenue estimated from rank|percent of players/i);
  if (forbiddenPopulationClaims) failures.push('forbidden population/performance claim found');

  return {
    key: testCase.key,
    appleId: testCase.id,
    canonicalName: body.game.canonicalName,
    publisher: body.game.publisher,
    findingCount: body.findings.length,
    unknownCount: body.unknowns.length,
    listingFindingCount: listingFindings.length,
    observedAt: body.sourceObservedAt,
    pass: failures.length === 0,
    failures,
    unknowns: body.unknowns,
    listingFindings: listingFindings.map((finding) => ({ key: finding.key, value: finding.value, coverage: finding.coverage })),
  };
}

const results = [];
for (const testCase of cases) {
  const result = await analyze(testCase);
  results.push(result);
  console.log(`[acceptance] ${result.pass ? 'PASS' : 'FAIL'} ${result.canonicalName} · ${result.findingCount} findings · ${result.unknownCount} unknowns`);
  for (const failure of result.failures) console.error(`  - ${failure}`);
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  liveEndpoint: endpoint,
  cases: results,
  automatedCriteria: {
    officialAppleIdentityResolved: results.every((result) => result.pass),
    provenancePresent: results.every((result) => result.pass && result.observedAt),
    unknownsRemainExplicit: results.every((result) => result.unknownCount >= 5),
    listingInferenceIsSeparated: results.every((result) => result.listingFindingCount >= 1),
    noRankToRevenueOrDownloadFabrication: results.every((result) => result.pass),
  },
};

await writeFile('v1-live-acceptance.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (results.some((result) => !result.pass)) process.exitCode = 1;
