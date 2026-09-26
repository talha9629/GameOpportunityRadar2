import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIR = path.resolve('public/data/policy');
const SNAPSHOT_DIR = path.join(OUTPUT_DIR, 'snapshots');
const INDEX_PATH = path.join(OUTPUT_DIR, 'index.json');
const CONFIRMATION_MIN_MS = 60 * 60 * 1000;

const SOURCES = [
  { id: 'apple-app-review-guidelines', vendor: 'apple', title: 'Apple App Review Guidelines', category: 'store_review', critical: true, url: 'https://developer.apple.com/app-store/review/guidelines/' },
  { id: 'apple-kids-safety', vendor: 'apple', title: 'Apple kids and age-appropriate experiences', category: 'kids_privacy', critical: true, url: 'https://developer.apple.com/kids/' },
  { id: 'apple-age-ratings', vendor: 'apple', title: 'Apple age ratings values and definitions', category: 'age_rating', critical: true, url: 'https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions' },
  { id: 'google-play-policy-index', vendor: 'google', title: 'Google Play Central Policy Resource', category: 'policy_index', critical: true, url: 'https://support.google.com/googleplay/android-developer/answer/15759508?hl=en' },
  { id: 'google-play-families', vendor: 'google', title: 'Google Play Families policies', category: 'kids_privacy', critical: true, url: 'https://support.google.com/googleplay/android-developer/answer/9893335?hl=en' },
  { id: 'google-play-ads', vendor: 'google', title: 'Google Play Ads policy', category: 'ads_monetization', critical: true, url: 'https://support.google.com/googleplay/android-developer/answer/9857753?hl=en' },
  { id: 'google-play-spam', vendor: 'google', title: 'Google Play Spam and repetitive content policy', category: 'copycat_quality', critical: true, url: 'https://support.google.com/googleplay/android-developer/answer/9899034?hl=en' },
  { id: 'google-play-policy-deadlines', vendor: 'google', title: 'Google Play Policy Deadlines', category: 'deadlines', critical: true, url: 'https://support.google.com/googleplay/android-developer/table/12921780?hl=en' },
];

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function decodeEntities(value) {
  const named = new Map([
    ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"], ['nbsp', ' '],
    ['ndash', '–'], ['mdash', '—'], ['hellip', '…'], ['rsquo', '’'], ['lsquo', '‘'],
    ['rdquo', '”'], ['ldquo', '“'], ['middot', '·'],
  ]);
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named.get(entity.toLowerCase()) ?? match;
  });
}

export function normalizePolicyHtml(html) {
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  let value = mainMatch?.[1] ?? html;
  value = value
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|tr|section|article|div|dt|dd|table|ul|ol)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ');

  value = decodeEntities(value).replace(/\r/g, '\n').replace(/\u00a0/g, ' ');
  const lines = value.split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !/^(skip to (main )?content|sign in|send feedback)$/i.test(line));

  const compact = [];
  for (const line of lines) {
    if (compact.at(-1) !== line) compact.push(line);
  }
  return compact.join('\n').trim();
}

async function readExistingIndex() {
  if (!existsSync(INDEX_PATH)) return null;
  try { return JSON.parse(await readFile(INDEX_PATH, 'utf8')); }
  catch { return null; }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'GameOpportunityRadar2-PolicyWatch/1.1 (+https://github.com/talha9629/GameOpportunityRadar2)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const normalizedText = normalizePolicyHtml(await response.text());
  if (normalizedText.length < 500) throw new Error(`Normalized policy text is unexpectedly short (${normalizedText.length} chars).`);
  return normalizedText;
}

function migrateChanges(changes) {
  return (Array.isArray(changes) ? changes : []).map((change) => ({
    ...change,
    confirmationStatus: change.confirmationStatus ?? 'legacy_unconfirmed',
  }));
}

function elapsedMs(firstSeenAt, now) {
  const first = Date.parse(firstSeenAt ?? '');
  const current = Date.parse(now);
  return Number.isFinite(first) && Number.isFinite(current) ? Math.max(0, current - first) : 0;
}

await mkdir(SNAPSHOT_DIR, { recursive: true });
const oldIndex = await readExistingIndex();
const oldSources = new Map((oldIndex?.sources ?? []).map((source) => [source.id, source]));
const now = new Date().toISOString();
const nextSources = [];
let freshCount = 0;
let failureCount = 0;
let confirmedChangeCount = 0;
let pendingCandidateCount = 0;

for (const source of SOURCES) {
  const old = oldSources.get(source.id);
  try {
    const normalizedText = await fetchSource(source);
    const hash = sha256(normalizedText);
    const snapshotRelativePath = `data/policy/snapshots/${source.id}/${hash}.json`;
    const snapshotFilePath = path.resolve('public', snapshotRelativePath);
    if (!existsSync(snapshotFilePath)) {
      await writeJson(snapshotFilePath, { schemaVersion: 1, sourceId: source.id, title: source.title, url: source.url, fetchedAt: now, hash, normalizedText });
    }

    const fetchedRef = { hash, path: snapshotRelativePath, fetchedAt: now };
    const history = Array.isArray(old?.history) ? [...old.history] : [];
    if (!history.some((entry) => entry.hash === hash)) history.push(fetchedRef);
    const changes = migrateChanges(old?.changes);

    let current = old?.current ?? fetchedRef;
    let pendingCandidate = old?.pendingCandidate ?? null;

    if (!old?.current) {
      current = fetchedRef;
      pendingCandidate = null;
    } else if (hash === old.current.hash) {
      current = fetchedRef;
      pendingCandidate = null;
    } else if (old.pendingCandidate?.hash === hash) {
      const observations = (old.pendingCandidate.observations ?? 1) + 1;
      const ageMs = elapsedMs(old.pendingCandidate.firstSeenAt, now);
      if (ageMs >= CONFIRMATION_MIN_MS) {
        const changeId = sha256(`${source.id}:${old.current.hash}:${hash}`);
        if (!changes.some((change) => change.id === changeId && change.confirmationStatus === 'confirmed_repeat')) {
          changes.push({
            id: changeId,
            fromHash: old.current.hash,
            toHash: hash,
            detectedAt: old.pendingCandidate.firstSeenAt,
            confirmedAt: now,
            observations,
            confirmationStatus: 'confirmed_repeat',
            fromPath: old.current.path,
            toPath: snapshotRelativePath,
          });
          confirmedChangeCount += 1;
        }
        current = fetchedRef;
        pendingCandidate = null;
      } else {
        pendingCandidate = {
          ...old.pendingCandidate,
          lastSeenAt: now,
          observations,
          minimumConfirmationAt: new Date(Date.parse(old.pendingCandidate.firstSeenAt) + CONFIRMATION_MIN_MS).toISOString(),
        };
        pendingCandidateCount += 1;
      }
    } else {
      pendingCandidate = {
        hash,
        path: snapshotRelativePath,
        firstSeenAt: now,
        lastSeenAt: now,
        observations: 1,
        minimumConfirmationAt: new Date(Date.parse(now) + CONFIRMATION_MIN_MS).toISOString(),
      };
      pendingCandidateCount += 1;
    }

    nextSources.push({
      ...source,
      fetchStatus: 'fresh',
      lastAttemptAt: now,
      error: null,
      current,
      pendingCandidate,
      history,
      changes,
    });
    freshCount += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[policy-watch] ${source.id}: ${message}`);
    failureCount += 1;
    nextSources.push({
      ...source,
      fetchStatus: old?.current ? 'stale' : 'unavailable',
      lastAttemptAt: now,
      error: message.slice(0, 500),
      current: old?.current ?? null,
      pendingCandidate: old?.pendingCandidate ?? null,
      history: Array.isArray(old?.history) ? old.history : [],
      changes: migrateChanges(old?.changes),
    });
  }
}

const runStatus = failureCount === 0 ? 'complete' : freshCount > 0 ? 'partial' : 'failed';
const index = {
  schemaVersion: 1,
  generatedAt: now,
  runStatus,
  sourceCount: SOURCES.length,
  freshCount,
  failureCount,
  confirmationPolicy: {
    observationsRequired: 2,
    minimumElapsedMinutes: CONFIRMATION_MIN_MS / 60_000,
    statement: 'A changed hash is reviewable only after the same changed content is observed again at least 60 minutes later. One-off hashes remain pending candidates.',
  },
  sources: nextSources,
};
await writeJson(INDEX_PATH, index);

const confirmedTotal = nextSources.reduce((sum, source) => sum + source.changes.filter((change) => change.confirmationStatus === 'confirmed_repeat').length, 0);
const pendingTotal = nextSources.filter((source) => source.pendingCandidate).length;
console.log(`[policy-watch] ${runStatus.toUpperCase()} · fresh ${freshCount}/${SOURCES.length} · failures ${failureCount} · confirmed ${confirmedTotal} · pending ${pendingTotal} · newly confirmed ${confirmedChangeCount}`);
if (runStatus === 'failed') process.exitCode = 1;
