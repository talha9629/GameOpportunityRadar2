import fs from 'node:fs';
import path from 'node:path';

const queue = JSON.parse(fs.readFileSync(path.resolve('public/data/research/latest.json'), 'utf8'));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

for (const candidate of queue.candidates ?? []) {
  const markets = candidate?.evidence?.markets ?? [];
  const marketCodes = markets.map((market) => market?.country);
  for (const key of ['1d', '3d', '7d']) {
    const perMarket = candidate?.evidence?.exactWindows?.[key]?.perMarket;
    assert(Array.isArray(perMarket), `${candidate.appId} ${key} perMarket missing`);
    assert(perMarket?.length === marketCodes.length, `${candidate.appId} ${key} perMarket length mismatch`);
    for (let index = 0; index < (perMarket?.length ?? 0); index += 1) {
      const signal = perMarket[index];
      assert(typeof signal?.market === 'string' && signal.market.length >= 2, `${candidate.appId} ${key} signal ${index} missing market`);
      assert(signal?.market === marketCodes[index], `${candidate.appId} ${key} signal ${index} market ${signal?.market} does not match ${marketCodes[index]}`);
    }
  }
}

if (errors.length) {
  console.error('[research-queue-transport] validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[research-queue-transport] validation PASS · ${queue.candidates?.length ?? 0} candidate(s) · explicit per-market identifiers present`);
