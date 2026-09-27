import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const latestPath = 'public/data/radar/latest.json';

function fail(message) {
  throw new Error(`Radar evidence-quality validation failed: ${message}`);
}

function readJson(text, label) {
  try { return JSON.parse(text); }
  catch (error) { fail(`${label} is not valid JSON (${error})`); }
}

const latest = readJson(fs.readFileSync(latestPath, 'utf8'), latestPath);
const chartDepth = latest?.chartDepth;
if (!Number.isInteger(chartDepth) || chartDepth < 1) fail(`invalid chartDepth ${chartDepth}`);

for (const [code, market] of Object.entries(latest?.markets ?? {})) {
  if (market?.status !== 'ok') continue;
  const observedDepth = Array.isArray(market.entries) ? market.entries.length : 0;
  if (observedDepth !== chartDepth) {
    fail(`${code} is marked ok with ${observedDepth} observed ranks while the snapshot declares Top ${chartDepth}; incomplete coverage must not become false not_ranked evidence`);
  }
}

let previousText = null;
try {
  previousText = execFileSync('git', ['show', `HEAD:${latestPath}`], { encoding: 'utf8' });
} catch {
  // First collection or environments without prior committed Radar evidence have nothing to compare.
}
const previous = previousText == null ? null : readJson(previousText, `HEAD:${latestPath}`);

const latestDate = typeof latest?.generatedAt === 'string' ? latest.generatedAt.slice(0, 10) : null;
const previousDate = typeof previous?.generatedAt === 'string' ? previous.generatedAt.slice(0, 10) : null;
if (previous && latestDate && previousDate === latestDate) {
  for (const [code, currentMarket] of Object.entries(latest.markets ?? {})) {
    const priorMarket = previous.markets?.[code];
    if (
      priorMarket?.status === 'ok'
      && priorMarket.gameFocused === true
      && Array.isArray(priorMarket.entries)
      && priorMarket.entries.length === chartDepth
      && currentMarket?.status === 'ok'
      && currentMarket.gameFocused === false
    ) {
      fail(`${code} would replace an earlier complete same-day Games-category observation with the overall-app fallback; keep the stronger same-day evidence instead`);
    }
  }
}

console.log(`Radar evidence quality OK: every successful market has full Top ${chartDepth} coverage and no stronger same-day Games evidence was downgraded.`);
