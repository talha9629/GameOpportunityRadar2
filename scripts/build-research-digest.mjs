import fs from 'node:fs';
import path from 'node:path';

const researchRoot = path.resolve('public/data/research');
const latestPath = path.join(researchRoot, 'latest.json');
const digestPath = path.join(researchRoot, 'digest.json');
const digestHistoryRoot = path.join(researchRoot, 'digest-history');
const weeklyDigestRoot = path.resolve('digest');
const radarRoot = path.resolve('public/data/radar');
const googleRoot = path.resolve('public/data/platforms/google-play');
const configPath = path.resolve('radar.config.json');

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function subtractUtcDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function lifecycle(candidate) {
  const threeDay = candidate?.evidence?.exactWindows?.['3d'];
  if (threeDay?.status === 'available' && threeDay.bestUpwardDelta != null) {
    if (threeDay.bestUpwardDelta > 0) return { state: 'RISING_EXACT_3D', evidence: `Best exact 3d rank improvement is +${threeDay.bestUpwardDelta}.` };
    if (threeDay.bestUpwardDelta < 0) return { state: 'FALLING_EXACT_3D', evidence: `Best exact 3d rank change is ${threeDay.bestUpwardDelta}.` };
    return { state: 'FLAT_EXACT_3D', evidence: 'Best exact 3d rank change is 0.' };
  }
  if ((candidate?.evidence?.maxObservedDays ?? 0) >= 7) return { state: 'PERSISTING_7D', evidence: `Observed on tracked chart for ${candidate.evidence.maxObservedDays} consecutive day(s).` };
  if ((candidate?.evidence?.maxObservedDays ?? 0) >= 3) return { state: 'PERSISTING_3D', evidence: `Observed on tracked chart for ${candidate.evidence.maxObservedDays} consecutive day(s).` };
  return { state: 'INSUFFICIENT_HISTORY', evidence: `Only ${candidate?.evidence?.maxObservedDays ?? 0} consecutive observed day(s); no 3-day direction is claimed.` };
}

function reasonDelta(currentReasons, previousReasons) {
  const current = new Set(Array.isArray(currentReasons) ? currentReasons : []);
  const previous = new Set(Array.isArray(previousReasons) ? previousReasons : []);
  return {
    added: [...current].filter((reason) => !previous.has(reason)).sort(),
    removed: [...previous].filter((reason) => !current.has(reason)).sort(),
  };
}

function reasonLabel(reason) {
  if (/^CROSS_MARKET_(\d+)$/.test(reason)) return `${reason.match(/^CROSS_MARKET_(\d+)$/)[1]}-market presence`;
  if (/^TOP_(\d+)$/.test(reason)) return `Top ${reason.match(/^TOP_(\d+)$/)[1]} best rank`;
  if (/^UP_(\d+)_PLUS_1D$/.test(reason)) return `1-day move of at least +${reason.match(/^UP_(\d+)_PLUS_1D$/)[1]} ranks`;
  if (/^NEW_ENTRY_TOP_(\d+)$/.test(reason)) return `new tracked entry inside Top ${reason.match(/^NEW_ENTRY_TOP_(\d+)$/)[1]}`;
  if (/^PERSISTED_(\d+)D$/.test(reason)) return `${reason.match(/^PERSISTED_(\d+)D$/)[1]}-day observed persistence`;
  return reason.replaceAll('_', ' ').toLowerCase();
}

function presentation(currentCandidate, previousCandidate = null) {
  const source = currentCandidate ?? previousCandidate ?? {};
  return {
    iconUrl: source.iconUrl ?? null,
    publisher: source.publisher ?? null,
    previousQueueRank: previousCandidate?.queueRank ?? null,
    currentQueueRank: currentCandidate?.queueRank ?? null,
  };
}

const current = readJson(latestPath);
if (!current?.radarDate || !Array.isArray(current?.candidates)) throw new Error('A valid research queue is required before digest generation.');
const comparisonDate = subtractUtcDays(current.radarDate, 1);
const previous = readJson(path.join(researchRoot, 'history', `${comparisonDate}.json`));
const changes = [];

if (previous?.radarDate === comparisonDate && Array.isArray(previous?.candidates)) {
  const previousById = new Map(previous.candidates.map((candidate) => [String(candidate.appId), candidate]));
  const currentById = new Map(current.candidates.map((candidate) => [String(candidate.appId), candidate]));

  for (const candidate of current.candidates) {
    const prior = previousById.get(String(candidate.appId));
    if (!prior) {
      changes.push({
        type: 'NEW_TO_RESEARCH_QUEUE',
        appId: candidate.appId,
        name: candidate.name,
        ...presentation(candidate),
        significance: 'attention',
        current: candidate.researchPriority,
        currentBestRank: candidate.evidence.bestRank,
        currentMarketCount: candidate.evidence.marketCount,
        evidence: [
          `Not present in the exact ${comparisonDate} queue.`,
          `Current deterministic research priority ${candidate.researchPriority}.`,
          `Current best Games rank #${candidate.evidence.bestRank} across ${candidate.evidence.marketCount} market(s).`,
        ],
      });
      continue;
    }

    const priorityDelta = candidate.researchPriority - prior.researchPriority;
    if (Math.abs(priorityDelta) >= 10) {
      const reasons = reasonDelta(candidate.reasonCodes, prior.reasonCodes);
      const evidence = [
        `Deterministic research priority changed ${prior.researchPriority} → ${candidate.researchPriority}.`,
        `Priority delta ${priorityDelta > 0 ? '+' : ''}${priorityDelta}.`,
      ];
      if (reasons.added.length > 0) evidence.push(`Added rank-evidence signals: ${reasons.added.map(reasonLabel).join(', ')}.`);
      if (reasons.removed.length > 0) evidence.push(`Removed rank-evidence signals: ${reasons.removed.map(reasonLabel).join(', ')}.`);
      if (reasons.added.length === 0 && reasons.removed.length === 0) evidence.push('Evidence-signal set is unchanged; the numeric priority changed within the same deterministic rules.');

      changes.push({
        type: priorityDelta > 0 ? 'PRIORITY_INCREASED' : 'PRIORITY_DECREASED',
        appId: candidate.appId,
        name: candidate.name,
        ...presentation(candidate, prior),
        significance: 'attention',
        previous: prior.researchPriority,
        current: candidate.researchPriority,
        delta: priorityDelta,
        previousBestRank: prior.evidence.bestRank,
        currentBestRank: candidate.evidence.bestRank,
        previousMarketCount: prior.evidence.marketCount,
        currentMarketCount: candidate.evidence.marketCount,
        reasonCodesAdded: reasons.added,
        reasonCodesRemoved: reasons.removed,
        evidence,
      });
    }

    const marketDelta = candidate.evidence.marketCount - prior.evidence.marketCount;
    if (marketDelta !== 0) {
      changes.push({
        type: marketDelta > 0 ? 'CROSS_MARKET_EXPANDED' : 'CROSS_MARKET_CONTRACTED',
        appId: candidate.appId,
        name: candidate.name,
        ...presentation(candidate, prior),
        significance: 'attention',
        previous: prior.evidence.marketCount,
        current: candidate.evidence.marketCount,
        delta: marketDelta,
        previousBestRank: prior.evidence.bestRank,
        currentBestRank: candidate.evidence.bestRank,
        evidence: [`Healthy Games-chart market presence changed ${prior.evidence.marketCount} → ${candidate.evidence.marketCount}.`, `Best rank is now #${candidate.evidence.bestRank}.`],
      });
    }

    const rankDelta = prior.evidence.bestRank - candidate.evidence.bestRank;
    if (Math.abs(rankDelta) >= 5) {
      changes.push({
        type: rankDelta > 0 ? 'BEST_RANK_IMPROVED' : 'BEST_RANK_DECLINED',
        appId: candidate.appId,
        name: candidate.name,
        ...presentation(candidate, prior),
        significance: 'info',
        previous: prior.evidence.bestRank,
        current: candidate.evidence.bestRank,
        delta: rankDelta,
        previousMarketCount: prior.evidence.marketCount,
        currentMarketCount: candidate.evidence.marketCount,
        evidence: [`Best observed Games rank changed #${prior.evidence.bestRank} → #${candidate.evidence.bestRank}.`, `Currently present in ${candidate.evidence.marketCount} healthy Games market(s).`],
      });
    }

    for (const days of [3, 7]) {
      const key = `${days}d`;
      const priorStatus = prior.evidence?.exactWindows?.[key]?.status;
      const currentSignal = candidate.evidence?.exactWindows?.[key];
      if (priorStatus !== 'available' && currentSignal?.status === 'available') {
        changes.push({
          type: `EXACT_${days}D_HISTORY_MATURED`,
          appId: candidate.appId,
          name: candidate.name,
          ...presentation(candidate, prior),
          significance: 'attention',
          current: currentSignal.bestUpwardDelta,
          currentBestRank: candidate.evidence.bestRank,
          evidence: [`Exact ${days}-day comparison is now available.`, `Best upward delta: ${currentSignal.bestUpwardDelta ?? 'no positive move'}.`, `Current best Games rank #${candidate.evidence.bestRank}.`],
        });
      }
    }
  }

  for (const candidate of previous.candidates) {
    if (!currentById.has(String(candidate.appId))) {
      changes.push({
        type: 'DROPPED_FROM_RESEARCH_QUEUE',
        appId: candidate.appId,
        name: candidate.name,
        ...presentation(null, candidate),
        significance: 'attention',
        previous: candidate.researchPriority,
        previousBestRank: candidate.evidence.bestRank,
        previousMarketCount: candidate.evidence.marketCount,
        evidence: [
          `Present in the exact ${comparisonDate} queue at queue #${candidate.queueRank}, priority ${candidate.researchPriority}, best rank #${candidate.evidence.bestRank}.`,
          'Absent from the current deterministic top-12 research queue.',
          'This records only a triage cutoff change; no product-performance conclusion is made.',
        ],
      });
    }
  }
}

const states = current.candidates.map((candidate) => ({
  appId: candidate.appId,
  name: candidate.name,
  iconUrl: candidate.iconUrl ?? null,
  publisher: candidate.publisher ?? null,
  queueRank: candidate.queueRank,
  researchPriority: candidate.researchPriority,
  ...lifecycle(candidate),
}));

const digest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  currentDate: current.radarDate,
  comparisonDate,
  status: previous?.radarDate === comparisonDate ? 'complete' : 'history_pending',
  statement: 'This digest reports exact observed changes between dated research queues. It does not predict success, downloads, revenue, or causal demand.',
  summary: {
    currentCandidateCount: current.candidates.length,
    changeCount: changes.length,
    attentionCount: changes.filter((change) => change.significance === 'attention').length,
    newCandidates: changes.filter((change) => change.type === 'NEW_TO_RESEARCH_QUEUE').length,
    droppedCandidates: changes.filter((change) => change.type === 'DROPPED_FROM_RESEARCH_QUEUE').length,
    marketChanges: changes.filter((change) => change.type.startsWith('CROSS_MARKET_')).length,
    maturityEvents: changes.filter((change) => /^EXACT_[37]D_HISTORY_MATURED$/.test(change.type)).length,
  },
  limitations: [
    'No previous exact-date queue means history_pending, not zero change.',
    'Priority changes reflect deterministic triage inputs, not changes in probability of commercial success.',
    'Dropped-from-queue is a triage state only and is not a claim about installs, revenue, retention or product quality.',
    'RISING/FALLING lifecycle states are only emitted when an exact 3-day rank comparison exists.',
  ],
  changes,
  states,
};

fs.mkdirSync(digestHistoryRoot, { recursive: true });
fs.writeFileSync(digestPath, `${JSON.stringify(digest, null, 2)}\n`);
fs.writeFileSync(path.join(digestHistoryRoot, `${current.radarDate}.json`), `${JSON.stringify(digest, null, 2)}\n`);
console.log(`[research-digest] ${digest.status} · ${digest.summary.changeCount} changes · ${digest.summary.attentionCount} attention · ${states.length} states`);

function dateRange(endDate, days) {
  return Array.from({ length: days }, (_, offset) => subtractUtcDays(endDate, days - offset - 1));
}

function normalizeTitle(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleTokens(value) {
  return new Set(normalizeTitle(value).split(' ').filter((token) => token.length >= 4));
}

function bestImprovement(game, snapshots, latestDate, storefronts, days) {
  const prior = snapshots.get(subtractUtcDays(latestDate, days));
  if (!prior) return null;
  const deltas = storefronts.flatMap((storefront) => {
    const currentRank = game.ranks[storefront];
    const priorEntry = prior.markets?.[storefront]?.entries?.find((entry) => String(entry.appId) === game.appId);
    return Number.isInteger(currentRank) && Number.isInteger(priorEntry?.rank) ? [priorEntry.rank - currentRank] : [];
  });
  return deltas.length > 0 ? Math.max(...deltas) : null;
}

function markdownValue(value) {
  return value == null ? '—' : String(value).replaceAll('|', '\\|');
}

const config = readJson(configPath);
if (!config || !Array.isArray(config.storefronts) || !Number.isInteger(config.prototypeDays)) {
  throw new Error('A valid radar.config.json is required for weekly digest generation.');
}

const radarIndex = readJson(path.join(radarRoot, 'index.json'));
const radarLatest = readJson(path.join(radarRoot, 'latest.json'));
const googleLatest = readJson(path.join(googleRoot, 'latest.json'));
if (!radarIndex?.snapshots || !radarLatest?.markets) throw new Error('Committed Apple Radar data is required for weekly digest generation.');

const trackedDates = new Set(radarIndex.snapshots.map((snapshot) => snapshot.date));
const availableDates = dateRange(current.radarDate, config.prototypeDays).filter((date) => trackedDates.has(date));
const missingDates = dateRange(current.radarDate, config.prototypeDays).filter((date) => !trackedDates.has(date));
const snapshots = new Map(availableDates.map((date) => [date, readJson(path.join(radarRoot, 'history', `${date}.json`))]).filter(([, value]) => value));
const queueById = new Map(current.candidates.map((candidate) => [String(candidate.appId), candidate]));
const googleEntries = googleLatest?.status === 'ok' && Array.isArray(googleLatest.entries) ? googleLatest.entries : [];
const googleByTitle = new Map(googleEntries.map((entry) => [normalizeTitle(entry.name), entry]));

const games = new Map();
for (const storefront of config.storefronts) {
  for (const entry of radarLatest.markets?.[storefront]?.entries ?? []) {
    const appId = String(entry.appId);
    const game = games.get(appId) ?? {
      appId,
      name: entry.name,
      developer: entry.publisher ?? null,
      storeUrl: entry.storeUrl ?? null,
      ranks: Object.fromEntries(config.storefronts.map((code) => [code, null])),
    };
    game.ranks[storefront] = entry.rank;
    games.set(appId, game);
  }
}

for (const game of games.values()) {
  const queue = queueById.get(game.appId);
  const metadata = queue?.appleMetadata;
  const matchingGenres = (metadata?.genres ?? []).filter((genre) => config.genres.includes(genre));
  game.genre = matchingGenres[0] ?? null;
  game.releaseAgeDays = Number.isInteger(metadata?.releaseAgeDays) ? metadata.releaseAgeDays : null;
  game.trendState = queue?.evidence?.trend?.state ?? null;
  game.daysInChart = availableDates.filter((date) => {
    const snapshot = snapshots.get(date);
    return config.storefronts.some((storefront) => snapshot?.markets?.[storefront]?.entries?.some((entry) => String(entry.appId) === game.appId));
  }).length;
  game.placesCharted = Object.values(game.ranks).filter(Number.isInteger).length;
  const firstSeenDates = config.storefronts.flatMap((storefront) => {
    const entry = radarLatest.markets?.[storefront]?.entries?.find((item) => String(item.appId) === game.appId);
    return entry?.firstObserved ? [entry.firstObserved] : [];
  });
  const firstSeen = firstSeenDates.length > 0 ? firstSeenDates.sort()[0] : null;
  const ageInDays = firstSeen ? Math.round((new Date(`${current.radarDate}T00:00:00Z`) - new Date(`${firstSeen}T00:00:00Z`)) / 86_400_000) : null;
  game.spike = ageInDays == null ? null : ageInDays < 3;
  game.rankChange = Object.fromEntries([1, 3, 7].map((days) => [`${days}d`, bestImprovement(game, snapshots, current.radarDate, config.storefronts, days)]));
  const google = googleByTitle.get(normalizeTitle(game.name));
  game.googleRank = google?.rank ?? null;
  game.candidate = game.daysInChart >= 5 && (game.rankChange['7d'] ?? 0) > 0 && game.placesCharted >= 2 && game.spike === false;
  game.sourceLinks = { apple: game.storeUrl, google: google?.storeUrl ?? null };
}

const allGames = [...games.values()];
for (const game of allGames) {
  const tokens = titleTokens(game.name);
  game.lookalikeCount = allGames.filter((other) => other.appId !== game.appId && (
    (game.genre != null && other.genre === game.genre)
    || [...tokens].some((token) => titleTokens(other.name).has(token))
  )).length;
}

const topGames = allGames
  .filter((game) => game.daysInChart >= 3 && game.rankChange['7d'] != null)
  .sort((a, b) => b.rankChange['7d'] - a.rankChange['7d'] || Math.min(...Object.values(a.ranks).filter(Number.isInteger)) - Math.min(...Object.values(b.ranks).filter(Number.isInteger)) || a.name.localeCompare(b.name))
  .slice(0, 30);

const missing = [];
if (missingDates.length > 0) missing.push(`Apple chart dates: ${missingDates.join(', ')}`);
if (googleLatest?.status !== 'ok') missing.push(`Google Play ranks: ${googleLatest?.status ?? 'missing'}`);
for (const game of topGames) {
  for (const field of ['developer', 'genre', 'releaseAgeDays', 'trendState', 'googleRank', 'spike']) {
    if (game[field] == null) missing.push(`games.${game.appId}.${field}`);
  }
  for (const storefront of config.storefronts) {
    if (game.ranks[storefront] == null) missing.push(`games.${game.appId}.ranks.${storefront}`);
  }
  for (const window of ['1d', '3d', '7d']) {
    if (game.rankChange[window] == null) missing.push(`games.${game.appId}.rankChange.${window}`);
  }
  for (const platform of ['apple', 'google']) {
    if (game.sourceLinks[platform] == null) missing.push(`games.${game.appId}.sourceLinks.${platform}`);
  }
}

let historyDays = 0;
while (trackedDates.has(subtractUtcDays(current.radarDate, historyDays))) historyDays += 1;
const confidence = historyDays < 7 ? 'EARLY' : historyDays <= 14 ? 'MEDIUM' : 'HIGH';
const weekly = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  radarDate: current.radarDate,
  historyDays,
  platformsCovered: ['Apple App Store', ...(googleLatest?.status === 'ok' ? ['Google Play'] : [])],
  missingDates,
  missing,
  confidence,
  config,
  selection: {
    rule: 'Top 30 current games by best exact 7-day storefront rank improvement, limited to games charted on at least 3 of the last 14 tracked days.',
    candidateRule: 'daysInChart >= 5, positive 7-day rank improvement, charted in 2+ places, and not a spike.',
    trendStateSource: 'Copied from public/data/research/latest.json; null when the research queue has no value.',
  },
  cards: topGames.filter((game) => game.candidate).slice(0, config.maxCards),
  games: topGames.map(({ storeUrl: _storeUrl, ...game }) => ({ ...game, confidence })),
};

const md = [
  '# Radar Lite weekly digest',
  '',
  `Generated: ${weekly.generatedAt}`,
  `History: ${historyDays} day(s) · Confidence: ${confidence}`,
  `Platforms covered: ${weekly.platformsCovered.join(', ') || 'None'}`,
  `Missing dates: ${missingDates.join(', ') || 'None'}`,
  `What is missing: ${missing.join('; ') || 'Nothing'}`,
  '',
  '## Prototype candidates',
  '',
  ...(weekly.cards.length > 0 ? weekly.cards.map((game) => `- **${game.name}** — improved ${game.rankChange['7d']} places in 7 days; charted ${game.daysInChart} days in ${game.placesCharted} places. Next action: inspect the store listing before prototyping.`) : ['No game meets the candidate rule this week. Next action: keep collecting chart history.']),
  '',
  '## Top 30 by 7-day rank improvement',
  '',
  '| Game | Developer | Genre | Release age | US/GB/CA/AU | Google | 1d / 3d / 7d | Days | Places | Spike | Lookalikes | Trend | Candidate | Confidence | Sources |',
  '|---|---|---|---:|---|---:|---|---:|---:|---|---:|---|---|---|---|',
  ...weekly.games.map((game) => {
    const appleLink = game.sourceLinks.apple ? `[Apple](${game.sourceLinks.apple})` : '—';
    const googleLink = game.sourceLinks.google ? `[Google](${game.sourceLinks.google})` : '—';
    return `| ${markdownValue(game.name)} | ${markdownValue(game.developer)} | ${markdownValue(game.genre)} | ${markdownValue(game.releaseAgeDays)} | ${config.storefronts.map((code) => markdownValue(game.ranks[code])).join('/')} | ${markdownValue(game.googleRank)} | ${markdownValue(game.rankChange['1d'])} / ${markdownValue(game.rankChange['3d'])} / ${markdownValue(game.rankChange['7d'])} | ${game.daysInChart} | ${game.placesCharted} | ${markdownValue(game.spike)} | ${game.lookalikeCount} | ${markdownValue(game.trendState)} | ${game.candidate} | ${confidence} | ${appleLink} ${googleLink} |`;
  }),
  '',
  '_Rank improvement is the best exact storefront change. Missing values are never inferred._',
  '',
].join('\n');

fs.mkdirSync(weeklyDigestRoot, { recursive: true });
fs.writeFileSync(path.join(weeklyDigestRoot, 'latest.json'), `${JSON.stringify(weekly, null, 2)}\n`);
fs.writeFileSync(path.join(weeklyDigestRoot, 'latest.md'), md);
console.log(`[weekly-digest] ${weekly.games.length} ranked games · ${weekly.cards.length} candidate card(s) · ${confidence}`);
