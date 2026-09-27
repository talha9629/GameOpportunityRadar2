import fs from 'node:fs';
import path from 'node:path';

const latestPath = path.resolve('public/data/research/latest.json');
const queue = JSON.parse(fs.readFileSync(latestPath, 'utf8'));

if (!Array.isArray(queue?.candidates)) throw new Error('Research queue is missing candidates.');
if (!queue?.radarDate) throw new Error('Research queue is missing radarDate.');

for (const candidate of queue.candidates) {
  const markets = candidate?.evidence?.markets;
  const windows = candidate?.evidence?.exactWindows;
  if (!Array.isArray(markets) || !windows) throw new Error(`${candidate?.appId ?? 'unknown'} is missing market/window evidence.`);

  const marketCodes = markets.map((market) => String(market?.country ?? '').trim());
  if (marketCodes.some((code) => !code)) throw new Error(`${candidate.appId} contains a market without a country code.`);
  if (new Set(marketCodes).size !== marketCodes.length) throw new Error(`${candidate.appId} contains duplicate market codes.`);

  for (const key of ['1d', '3d', '7d']) {
    const window = windows[key];
    if (!Array.isArray(window?.perMarket) || window.perMarket.length !== marketCodes.length) {
      throw new Error(`${candidate.appId} ${key} per-market evidence count does not match current markets.`);
    }

    window.perMarket = window.perMarket.map((signal, index) => ({
      ...signal,
      market: String(signal?.market ?? marketCodes[index]),
    }));
  }
}

const serialized = `${JSON.stringify(queue, null, 2)}\n`;
fs.writeFileSync(latestPath, serialized, 'utf8');
const historyPath = path.resolve('public/data/research/history', `${queue.radarDate}.json`);
fs.mkdirSync(path.dirname(historyPath), { recursive: true });
fs.writeFileSync(historyPath, serialized, 'utf8');

console.log(`[research-queue-contract] finalized ${queue.candidates.length} candidate(s) with explicit per-market window identifiers.`);
