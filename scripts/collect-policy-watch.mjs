import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizePolicySourceHtml, POLICY_NORMALIZATION_VERSION } from './policy-normalization.mjs';
import {
  POLICY_CONFIRMATION_MIN_MS,
  POLICY_CONFIRMATION_OBSERVATIONS_REQUIRED,
  POLICY_CONFIRMATION_VERSION,
  advancePolicyConfirmation,
  interruptPolicyCandidate,
} from './policy-confirmation.mjs';

const OUTPUT_DIR = path.resolve('public/data/policy');
const SNAPSHOT_DIR = path.join(OUTPUT_DIR, 'snapshots');
const INDEX_PATH = path.join(OUTPUT_DIR, 'index.json');

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
      'User-Agent': 'GameOpportunityRadar2-PolicyWatch/1.3 (+https://github.com/talha9629/GameOpportunityRadar2)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const normalizedText = normalizePolicySourceHtml(source, await response.text());
  if (normalizedText.length < 500) throw new Error(`Normalized policy text is unexpectedly short (${normalizedText.length} chars).`);
  return normalizedText;
}

function migrateChanges(changes) {
  return (Array.isArray(changes) ? changes : []).map((change) => ({
    ...change,
    confirmationStatus: change.confirmationStatus ?? 'legacy_unconfirmed',
  }));
}

function addInterruption(list, interruption) {
  if (!interruption) return list;
  const id = sha256(`${interruption.hash}:${interruption.firstSeenAt}:${interruption.interruptedAt}:${interruption.reason}`);
  if (list.some((entry) => entry.id === id)) return list;
  return [...list, { id, ...interruption }];
}

await mkdir(SNAPSHOT_DIR, { recursive: true });
const oldIndex = await readExistingIndex();
const oldSources = new Map((oldIndex?.sources ?? []).map((source) => [source.id, source]));
const now = new Date().toISOString();
const nextSources = [];
let freshCount = 0;
let failureCount = 0;
let confirmedChangeCount = 0;
let normalizationRebaselineCount = 0;
let interruptedCandidateCount = 0;

for (const source of SOURCES) {
  const old = oldSources.get(source.id);
  const changes = migrateChanges(old?.changes);
  const history = Array.isArray(old?.history) ? [...old.history] : [];
  const normalizationRebaselines = Array.isArray(old?.normalizationRebaselines) ? [...old.normalizationRebaselines] : [];
  let candidateInterruptions = Array.isArray(old?.candidateInterruptions) ? [...old.candidateInterruptions] : [];

  try {
    const normalizedText = await fetchSource(source);
    const hash = sha256(normalizedText);
    const snapshotRelativePath = `data/policy/snapshots/${source.id}/v${POLICY_NORMALIZATION_VERSION}/${hash}.json`;
    const snapshotFilePath = path.resolve('public', snapshotRelativePath);
    if (!existsSync(snapshotFilePath)) {
      await writeJson(snapshotFilePath, {
        schemaVersion: 1,
        normalizationVersion: POLICY_NORMALIZATION_VERSION,
        sourceId: source.id,
        title: source.title,
        url: source.url,
        fetchedAt: now,
        hash,
        normalizedText,
      });
    }

    const fetchedRef = { hash, path: snapshotRelativePath, fetchedAt: now, normalizationVersion: POLICY_NORMALIZATION_VERSION };
    if (!history.some((entry) => entry.path === snapshotRelativePath)) history.push(fetchedRef);

    let current = old?.current ?? fetchedRef;
    let pendingCandidate = old?.pendingCandidate ?? null;
    const oldCurrentNormalizationVersion = old?.current?.normalizationVersion ?? oldIndex?.normalizationVersion ?? 1;
    const normalizationChanged = Boolean(old?.current) && oldCurrentNormalizationVersion !== POLICY_NORMALIZATION_VERSION;

    if (!old?.current) {
      current = fetchedRef;
      pendingCandidate = null;
    } else if (normalizationChanged) {
      const rebaselineId = sha256(`${source.id}:normalization:${old.current.hash}:${hash}:${oldCurrentNormalizationVersion}:${POLICY_NORMALIZATION_VERSION}`);
      if (!normalizationRebaselines.some((entry) => entry.id === rebaselineId)) {
        normalizationRebaselines.push({
          id: rebaselineId,
          at: now,
          fromHash: old.current.hash,
          toHash: hash,
          fromPath: old.current.path,
          toPath: snapshotRelativePath,
          fromNormalizationVersion: oldCurrentNormalizationVersion,
          toNormalizationVersion: POLICY_NORMALIZATION_VERSION,
          contentHashChanged: hash !== old.current.hash,
          reason: 'normalizer_upgrade',
        });
        normalizationRebaselineCount += 1;
      }
      if (pendingCandidate) {
        const interrupted = interruptPolicyCandidate(pendingCandidate, now, 'normalizer_upgrade').interruption;
        candidateInterruptions = addInterruption(candidateInterruptions, interrupted);
        interruptedCandidateCount += interrupted ? 1 : 0;
      }
      current = fetchedRef;
      pendingCandidate = null;
    } else {
      const result = advancePolicyConfirmation({
        sourceId: source.id,
        current: old.current,
        pendingCandidate,
        fetchedRef,
        now,
        normalizationVersion: POLICY_NORMALIZATION_VERSION,
      });
      current = result.current;
      pendingCandidate = result.pendingCandidate;
      if (result.interruption) {
        candidateInterruptions = addInterruption(candidateInterruptions, result.interruption);
        interruptedCandidateCount += 1;
      }
      if (result.confirmedChange && !changes.some((change) => change.id === result.confirmedChange.id && change.confirmationStatus === 'confirmed_repeat')) {
        changes.push(result.confirmedChange);
        confirmedChangeCount += 1;
      }
    }

    nextSources.push({
      ...source,
      fetchStatus: 'fresh',
      lastAttemptAt: now,
      error: null,
      normalizationVersion: POLICY_NORMALIZATION_VERSION,
      current,
      pendingCandidate,
      history,
      changes,
      normalizationRebaselines,
      candidateInterruptions,
    });
    freshCount += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[policy-watch] ${source.id}: ${message}`);
    failureCount += 1;
    let pendingCandidate = old?.pendingCandidate ?? null;
    if (pendingCandidate) {
      const interrupted = interruptPolicyCandidate(pendingCandidate, now, 'fetch_failure').interruption;
      candidateInterruptions = addInterruption(candidateInterruptions, interrupted);
      interruptedCandidateCount += interrupted ? 1 : 0;
      pendingCandidate = null;
    }
    nextSources.push({
      ...source,
      fetchStatus: old?.current ? 'stale' : 'unavailable',
      lastAttemptAt: now,
      error: message.slice(0, 500),
      normalizationVersion: old?.normalizationVersion ?? oldIndex?.normalizationVersion ?? 1,
      current: old?.current ?? null,
      pendingCandidate,
      history,
      changes,
      normalizationRebaselines,
      candidateInterruptions,
    });
  }
}

const runStatus = failureCount === 0 ? 'complete' : freshCount > 0 ? 'partial' : 'failed';
const index = {
  schemaVersion: 1,
  normalizationVersion: POLICY_NORMALIZATION_VERSION,
  confirmationVersion: POLICY_CONFIRMATION_VERSION,
  generatedAt: now,
  runStatus,
  sourceCount: SOURCES.length,
  freshCount,
  failureCount,
  confirmationPolicy: {
    observationsRequired: POLICY_CONFIRMATION_OBSERVATIONS_REQUIRED,
    consecutiveSuccessfulObservationsRequired: true,
    fetchFailureBreaksContinuity: true,
    minimumElapsedMinutes: POLICY_CONFIRMATION_MIN_MS / 60_000,
    statement: 'A changed hash becomes reviewable only after three consecutive successful observations of the same normalized content spanning at least 60 minutes. A fetch failure, a different successful hash, baseline reappearance, or a normalizer upgrade breaks candidate continuity. Normalizer upgrades are rebaselined and never counted as policy changes.',
  },
  sources: nextSources,
};
await writeJson(INDEX_PATH, index);

const confirmedTotal = nextSources.reduce((sum, source) => sum + source.changes.filter((change) => change.confirmationStatus === 'confirmed_repeat').length, 0);
const pendingTotal = nextSources.filter((source) => source.pendingCandidate).length;
console.log(`[policy-watch] ${runStatus.toUpperCase()} · fresh ${freshCount}/${SOURCES.length} · failures ${failureCount} · confirmed ${confirmedTotal} · pending ${pendingTotal} · newly confirmed ${confirmedChangeCount} · normalization rebaselines ${normalizationRebaselineCount} · interrupted candidates ${interruptedCandidateCount}`);
if (runStatus === 'failed') process.exitCode = 1;
