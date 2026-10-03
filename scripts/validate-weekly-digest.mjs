import fs from 'node:fs';

const digest = JSON.parse(fs.readFileSync('digest/latest.json', 'utf8'));
const missingDetail = JSON.parse(fs.readFileSync('digest/missing-detail.json', 'utf8'));
const queue = JSON.parse(fs.readFileSync('public/data/research/latest.json', 'utf8'));
const metadata = JSON.parse(fs.readFileSync('data/apple-metadata.json', 'utf8'));
const config = JSON.parse(fs.readFileSync('radar.config.json', 'utf8'));
const queueById = new Map(queue.candidates.map((candidate) => [String(candidate.appId), candidate]));
const nameExclusion = new RegExp(config.excludeNameRegex, 'i');

if (!fs.existsSync('digest/latest.md')) throw new Error('digest/latest.md is missing.');
if (!Array.isArray(digest.games) || digest.games.length > 30) throw new Error('Digest must contain at most 30 games.');
if (!Array.isArray(digest.cards) || digest.cards.length > config.maxCards) throw new Error('Digest exceeds maxCards.');
if (!Array.isArray(digest.excluded)) throw new Error('Digest excluded list is missing.');
if (!Array.isArray(digest.missing) || digest.missing.length > 10 || digest.missing.some((item) => item.startsWith('games.'))) throw new Error('Digest missing summary must contain only compact counts.');
if (!Array.isArray(missingDetail.missing) || missingDetail.radarDate !== digest.radarDate) throw new Error('Missing-detail sidecar is invalid.');
if (!['EARLY', 'MEDIUM', 'HIGH'].includes(digest.confidence)) throw new Error('Invalid digest confidence.');

const cardIds = new Set(digest.cards.map((game) => String(game.appId)));
for (const game of digest.games) {
  if (game.daysInChart < 3) throw new Error(`${game.name} has fewer than 3 chart days.`);
  const genres = metadata.apps?.[String(game.appId)]?.genres;
  if (!Array.isArray(genres) || !genres.some((genre) => config.includeGenres.includes(genre))) throw new Error(`${game.name} does not have an included genre.`);
  if (genres.some((genre) => config.excludeGenres.includes(genre)) || nameExclusion.test(game.name)) throw new Error(`${game.name} should have been excluded.`);
  const expectedConfidence = digest.historyDays < 7 ? 'EARLY' : digest.historyDays <= 14 ? 'MEDIUM' : 'HIGH';
  if (game.confidence !== expectedConfidence) throw new Error(`${game.name} confidence is not based only on historyDays.`);
  const expectedTrend = queueById.get(String(game.appId))?.evidence?.trend?.state ?? null;
  if (game.trendState !== expectedTrend) throw new Error(`${game.name} trendState was not copied from the research queue.`);
  const baseRule = game.daysInChart >= 5 && game.rankChange['7d'] > 0 && game.placesCharted >= 2 && game.spike === false;
  const expectedCandidate = baseRule && game.releaseAgeDays != null && game.releaseAgeDays <= config.maxAgeDays;
  if (game.candidate !== expectedCandidate) throw new Error(`${game.name} candidate rule mismatch.`);
  if (game.releaseAgeDays == null && game.candidateReason !== 'age unknown') throw new Error(`${game.name} must explain unknown age.`);
  if (game.releaseAgeDays > config.maxAgeDays && cardIds.has(String(game.appId))) throw new Error(`${game.name} is too old to become a card.`);
  for (const field of ['developer', 'genre', 'releaseAgeDays', 'trendState', 'googleRank', 'spike']) {
    if (game[field] == null && !missingDetail.missing.includes(`games.${game.appId}.${field}`)) throw new Error(`${game.name}.${field} is null but not listed under missing.`);
  }
  for (const storefront of config.storefronts) {
    if (game.ranks[storefront] == null && !missingDetail.missing.includes(`games.${game.appId}.ranks.${storefront}`)) throw new Error(`${game.name}.${storefront} rank is null but not listed under missing.`);
  }
  for (const window of ['1d', '3d', '7d']) {
    if (game.rankChange[window] == null && !missingDetail.missing.includes(`games.${game.appId}.rankChange.${window}`)) throw new Error(`${game.name}.${window} change is null but not listed under missing.`);
  }
  for (const platform of ['apple', 'google']) {
    if (game.sourceLinks[platform] == null && !missingDetail.missing.includes(`games.${game.appId}.sourceLinks.${platform}`)) throw new Error(`${game.name}.${platform} source is null but not listed under missing.`);
  }
}
for (const excluded of digest.excluded) {
  if (!excluded.reason) throw new Error(`${excluded.name} has no exclusion reason.`);
}

console.log(`[weekly-digest] valid · ${digest.games.length} games · ${digest.cards.length} cards · ${digest.excluded.length} excluded · ${digest.confidence}`);
