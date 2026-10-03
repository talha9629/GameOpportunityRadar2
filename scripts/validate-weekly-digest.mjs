import fs from 'node:fs';

const digest = JSON.parse(fs.readFileSync('digest/latest.json', 'utf8'));
const queue = JSON.parse(fs.readFileSync('public/data/research/latest.json', 'utf8'));
const config = JSON.parse(fs.readFileSync('radar.config.json', 'utf8'));
const queueById = new Map(queue.candidates.map((candidate) => [String(candidate.appId), candidate]));

if (!fs.existsSync('digest/latest.md')) throw new Error('digest/latest.md is missing.');
if (!Array.isArray(digest.games) || digest.games.length > 30) throw new Error('Digest must contain at most 30 games.');
if (!Array.isArray(digest.cards) || digest.cards.length > config.maxCards) throw new Error('Digest exceeds maxCards.');
if (!['EARLY', 'MEDIUM', 'HIGH'].includes(digest.confidence)) throw new Error('Invalid digest confidence.');

for (const game of digest.games) {
  if (game.daysInChart < 3) throw new Error(`${game.name} has fewer than 3 chart days.`);
  const expectedConfidence = digest.historyDays < 7 ? 'EARLY' : digest.historyDays <= 14 ? 'MEDIUM' : 'HIGH';
  if (game.confidence !== expectedConfidence) throw new Error(`${game.name} confidence is not based only on historyDays.`);
  const expectedTrend = queueById.get(String(game.appId))?.evidence?.trend?.state ?? null;
  if (game.trendState !== expectedTrend) throw new Error(`${game.name} trendState was not copied from the research queue.`);
  const expectedCandidate = game.daysInChart >= 5 && game.rankChange['7d'] > 0 && game.placesCharted >= 2 && game.spike === false;
  if (game.candidate !== expectedCandidate) throw new Error(`${game.name} candidate rule mismatch.`);
  for (const field of ['developer', 'genre', 'releaseAgeDays', 'trendState', 'googleRank', 'spike']) {
    if (game[field] == null && !digest.missing.includes(`games.${game.appId}.${field}`)) throw new Error(`${game.name}.${field} is null but not listed under missing.`);
  }
  for (const storefront of config.storefronts) {
    if (game.ranks[storefront] == null && !digest.missing.includes(`games.${game.appId}.ranks.${storefront}`)) throw new Error(`${game.name}.${storefront} rank is null but not listed under missing.`);
  }
  for (const window of ['1d', '3d', '7d']) {
    if (game.rankChange[window] == null && !digest.missing.includes(`games.${game.appId}.rankChange.${window}`)) throw new Error(`${game.name}.${window} change is null but not listed under missing.`);
  }
  for (const platform of ['apple', 'google']) {
    if (game.sourceLinks[platform] == null && !digest.missing.includes(`games.${game.appId}.sourceLinks.${platform}`)) throw new Error(`${game.name}.${platform} source is null but not listed under missing.`);
  }
}

console.log(`[weekly-digest] valid · ${digest.games.length} games · ${digest.cards.length} cards · ${digest.confidence}`);
