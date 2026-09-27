import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { POLICY_NORMALIZATION_VERSION } from './policy-normalization.mjs';
import {
  POLICY_CONFIRMATION_OBSERVATIONS_REQUIRED,
  POLICY_CONFIRMATION_VERSION,
} from './policy-confirmation.mjs';

const indexPath = path.resolve('public/data/policy/index.json');
if (!existsSync(indexPath)) throw new Error('Policy index is missing.');

const index = JSON.parse(await readFile(indexPath, 'utf8'));
if (index.schemaVersion !== 1) throw new Error('Unsupported policy index schemaVersion.');
if (![1, 2, POLICY_NORMALIZATION_VERSION].includes(index.normalizationVersion ?? 1)) throw new Error('Unsupported policy normalizationVersion.');
if (!Array.isArray(index.sources) || index.sources.length < 1) throw new Error('Policy index has no sources.');
if (!['complete', 'partial', 'failed'].includes(index.runStatus)) throw new Error(`Invalid policy runStatus: ${index.runStatus}`);

const migratedConfirmation = index.confirmationVersion === POLICY_CONFIRMATION_VERSION;
if (!index.confirmationPolicy || index.confirmationPolicy.minimumElapsedMinutes < 60) {
  throw new Error('Policy confirmation policy must require a stability window of at least 60 minutes.');
}
if (migratedConfirmation) {
  if (index.confirmationPolicy.observationsRequired !== POLICY_CONFIRMATION_OBSERVATIONS_REQUIRED
    || index.confirmationPolicy.consecutiveSuccessfulObservationsRequired !== true
    || index.confirmationPolicy.fetchFailureBreaksContinuity !== true) {
    throw new Error('Policy confirmation v2 must require three consecutive successful observations and break continuity on fetch failure.');
  }
} else if (index.confirmationPolicy.observationsRequired !== 2) {
  throw new Error('Legacy policy confirmation data must retain its original two-observation contract until migrated.');
}

const sourceIds = new Set();
let snapshotCount = 0;
let confirmedChangeCount = 0;
let legacyChangeCount = 0;
let pendingCount = 0;
let rebaselineCount = 0;
let interruptionCount = 0;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function loadSnapshot(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.startsWith('data/policy/snapshots/')) {
    throw new Error(`Unsafe or invalid policy snapshot path: ${relativePath}`);
  }
  const filePath = path.resolve('public', relativePath);
  if (!existsSync(filePath)) throw new Error(`Referenced policy snapshot does not exist: ${relativePath}`);
  const snapshot = JSON.parse(await readFile(filePath, 'utf8'));
  if (snapshot.schemaVersion !== 1) throw new Error(`Invalid snapshot schemaVersion: ${relativePath}`);
  if (![1, 2, POLICY_NORMALIZATION_VERSION].includes(snapshot.normalizationVersion ?? 1)) throw new Error(`Invalid normalizationVersion: ${relativePath}`);
  if (typeof snapshot.normalizedText !== 'string' || snapshot.normalizedText.length < 500) {
    throw new Error(`Snapshot text is missing/too short: ${relativePath}`);
  }
  if (sha256(snapshot.normalizedText) !== snapshot.hash) throw new Error(`Snapshot hash mismatch: ${relativePath}`);
  if ((snapshot.normalizationVersion ?? 1) === POLICY_NORMALIZATION_VERSION && !relativePath.includes(`/v${POLICY_NORMALIZATION_VERSION}/`)) {
    throw new Error(`Normalization v${POLICY_NORMALIZATION_VERSION} snapshot is not version-scoped: ${relativePath}`);
  }
  return snapshot;
}

for (const source of index.sources) {
  if (!source.id || sourceIds.has(source.id)) throw new Error(`Duplicate/invalid policy source id: ${source.id}`);
  sourceIds.add(source.id);
  if (!['apple', 'google'].includes(source.vendor)) throw new Error(`Invalid vendor for ${source.id}`);
  if (!['fresh', 'stale', 'unavailable'].includes(source.fetchStatus)) throw new Error(`Invalid fetchStatus for ${source.id}`);
  if (!Array.isArray(source.history) || !Array.isArray(source.changes)) throw new Error(`Missing history/changes for ${source.id}`);
  if (source.normalizationVersion != null && ![1, 2, POLICY_NORMALIZATION_VERSION].includes(source.normalizationVersion)) {
    throw new Error(`Unsupported source normalizationVersion for ${source.id}`);
  }

  const snapshotsByPath = new Map();
  for (const entry of source.history) {
    if (!/^[a-f0-9]{64}$/.test(entry.hash)) throw new Error(`Invalid history hash for ${source.id}`);
    const snapshot = await loadSnapshot(entry.path);
    if (snapshot.sourceId !== source.id || snapshot.hash !== entry.hash) throw new Error(`History metadata mismatch for ${source.id}`);
    snapshotsByPath.set(entry.path, snapshot);
    snapshotCount += 1;
  }

  if (source.current && !snapshotsByPath.has(source.current.path)) throw new Error(`Current snapshot missing from history for ${source.id}`);
  if (source.current) {
    const currentSnapshot = snapshotsByPath.get(source.current.path);
    if (!currentSnapshot || currentSnapshot.hash !== source.current.hash) throw new Error(`Current snapshot metadata mismatch for ${source.id}`);
  }
  if ((index.normalizationVersion ?? 1) === POLICY_NORMALIZATION_VERSION && source.fetchStatus === 'fresh' && source.current) {
    const currentSnapshot = snapshotsByPath.get(source.current.path);
    if ((currentSnapshot?.normalizationVersion ?? 1) !== POLICY_NORMALIZATION_VERSION) {
      throw new Error(`Fresh current snapshot is not on normalization v${POLICY_NORMALIZATION_VERSION} for ${source.id}`);
    }
  }

  if (source.pendingCandidate) {
    const pending = source.pendingCandidate;
    if (!/^[a-f0-9]{64}$/.test(pending.hash)) throw new Error(`Invalid pending hash for ${source.id}`);
    const pendingSnapshot = snapshotsByPath.get(pending.path);
    if (!pendingSnapshot || pendingSnapshot.hash !== pending.hash) throw new Error(`Pending snapshot mismatch for ${source.id}`);
    if (source.current?.hash === pending.hash) throw new Error(`Pending hash equals current hash for ${source.id}`);
    if (!Number.isInteger(pending.observations) || pending.observations < 1) throw new Error(`Pending observations invalid for ${source.id}`);
    const pendingNormalization = pending.normalizationVersion ?? pendingSnapshot.normalizationVersion ?? 1;
    const currentSnapshot = source.current ? snapshotsByPath.get(source.current.path) : null;
    const currentNormalization = source.current?.normalizationVersion ?? currentSnapshot?.normalizationVersion ?? 1;
    if (pendingNormalization !== currentNormalization) throw new Error(`Pending/current normalization mismatch for ${source.id}`);
    const first = Date.parse(pending.firstSeenAt);
    const last = Date.parse(pending.lastSeenAt);
    const minimum = Date.parse(pending.minimumConfirmationAt);
    if (![first, last, minimum].every(Number.isFinite) || last < first || minimum < first + 60 * 60 * 1000) {
      throw new Error(`Pending timing invalid for ${source.id}`);
    }
    if (pending.confirmationVersion === POLICY_CONFIRMATION_VERSION) {
      if (!Array.isArray(pending.observationTimestamps) || pending.observationTimestamps.length !== pending.observations) {
        throw new Error(`Pending observation timestamps do not match observation count for ${source.id}`);
      }
      if (pending.observations >= POLICY_CONFIRMATION_OBSERVATIONS_REQUIRED) {
        throw new Error(`Pending candidate should already have been confirmed for ${source.id}`);
      }
    }
    pendingCount += 1;
  }

  const rebaselineIds = new Set();
  for (const rebaseline of source.normalizationRebaselines ?? []) {
    if (!/^[a-f0-9]{64}$/.test(rebaseline.id) || rebaselineIds.has(rebaseline.id)) throw new Error(`Invalid/duplicate normalization rebaseline for ${source.id}`);
    rebaselineIds.add(rebaseline.id);
    const expectedId = sha256(`${source.id}:normalization:${rebaseline.fromHash}:${rebaseline.toHash}:${rebaseline.fromNormalizationVersion}:${rebaseline.toNormalizationVersion}`);
    if (expectedId !== rebaseline.id) throw new Error(`Normalization rebaseline id mismatch for ${source.id}`);
    if (rebaseline.reason !== 'normalizer_upgrade') throw new Error(`Unexpected normalization rebaseline reason for ${source.id}`);
    if (rebaseline.fromNormalizationVersion >= rebaseline.toNormalizationVersion) throw new Error(`Invalid normalization migration versions for ${source.id}`);
    if (!Number.isFinite(Date.parse(rebaseline.at))) throw new Error(`Invalid normalization rebaseline timestamp for ${source.id}`);
    if (rebaseline.fromPath && !snapshotsByPath.has(rebaseline.fromPath)) throw new Error(`Normalization rebaseline fromPath missing for ${source.id}`);
    if (rebaseline.toPath && !snapshotsByPath.has(rebaseline.toPath)) throw new Error(`Normalization rebaseline toPath missing for ${source.id}`);
    if (rebaseline.toNormalizationVersion === POLICY_NORMALIZATION_VERSION && !rebaseline.toPath) {
      throw new Error(`Normalization v${POLICY_NORMALIZATION_VERSION} rebaseline must record toPath for ${source.id}`);
    }
    rebaselineCount += 1;
  }

  const interruptionIds = new Set();
  for (const interruption of source.candidateInterruptions ?? []) {
    if (!/^[a-f0-9]{64}$/.test(interruption.id) || interruptionIds.has(interruption.id)) throw new Error(`Invalid/duplicate candidate interruption for ${source.id}`);
    interruptionIds.add(interruption.id);
    if (!['fetch_failure', 'different_successful_hash', 'baseline_reappeared', 'normalizer_upgrade'].includes(interruption.reason)) {
      throw new Error(`Unexpected candidate interruption reason for ${source.id}`);
    }
    if (!Number.isFinite(Date.parse(interruption.interruptedAt))) throw new Error(`Invalid interruption timestamp for ${source.id}`);
    interruptionCount += 1;
  }

  const changeIds = new Set();
  for (const change of source.changes) {
    if (!/^[a-f0-9]{64}$/.test(change.id) || changeIds.has(change.id)) throw new Error(`Invalid/duplicate change id for ${source.id}`);
    changeIds.add(change.id);
    const expectedId = sha256(`${source.id}:${change.fromHash}:${change.toHash}`);
    if (expectedId !== change.id) throw new Error(`Policy change id mismatch for ${source.id}`);
    const fromSnapshot = snapshotsByPath.get(change.fromPath);
    const toSnapshot = snapshotsByPath.get(change.toPath);
    if (!fromSnapshot || fromSnapshot.hash !== change.fromHash) throw new Error(`Change from-snapshot mismatch for ${source.id}`);
    if (!toSnapshot || toSnapshot.hash !== change.toHash) throw new Error(`Change to-snapshot mismatch for ${source.id}`);
    if (!['legacy_unconfirmed', 'confirmed_repeat'].includes(change.confirmationStatus)) throw new Error(`Invalid confirmationStatus for ${source.id}`);
    if (change.confirmationStatus === 'confirmed_repeat') {
      const requiredObservations = change.confirmationVersion === POLICY_CONFIRMATION_VERSION ? POLICY_CONFIRMATION_OBSERVATIONS_REQUIRED : 2;
      if (!Number.isInteger(change.observations) || change.observations < requiredObservations) throw new Error(`Confirmed change lacks repeated observations for ${source.id}`);
      const detected = Date.parse(change.detectedAt);
      const confirmed = Date.parse(change.confirmedAt);
      if (!Number.isFinite(detected) || !Number.isFinite(confirmed) || confirmed - detected < 60 * 60 * 1000) {
        throw new Error(`Confirmed change does not meet minimum stability window for ${source.id}`);
      }
      if ((fromSnapshot.normalizationVersion ?? 1) !== (toSnapshot.normalizationVersion ?? 1)) throw new Error(`Confirmed change crosses normalization versions for ${source.id}`);
      if (change.confirmationVersion === POLICY_CONFIRMATION_VERSION) {
        if (change.consecutiveSuccessfulObservations !== true) throw new Error(`Confirmed change lacks continuity proof for ${source.id}`);
        if (!Array.isArray(change.observationTimestamps) || change.observationTimestamps.length !== change.observations) {
          throw new Error(`Confirmed change observation timestamps are incomplete for ${source.id}`);
        }
      }
      confirmedChangeCount += 1;
    } else {
      legacyChangeCount += 1;
    }
  }
}

console.log(`[policy-watch] validation PASS · ${index.sources.length} sources · ${snapshotCount} snapshots · confirmed ${confirmedChangeCount} · pending ${pendingCount} · normalization rebaselines ${rebaselineCount} · interruptions ${interruptionCount} · legacy-unconfirmed ${legacyChangeCount} · ${index.runStatus}`);
