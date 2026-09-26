import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const indexPath = path.resolve('public/data/policy/index.json');
if (!existsSync(indexPath)) throw new Error('Policy index is missing.');

const index = JSON.parse(await readFile(indexPath, 'utf8'));
if (index.schemaVersion !== 1) throw new Error('Unsupported policy index schemaVersion.');
if (!Array.isArray(index.sources) || index.sources.length < 1) throw new Error('Policy index has no sources.');
if (!['complete', 'partial', 'failed'].includes(index.runStatus)) throw new Error(`Invalid policy runStatus: ${index.runStatus}`);
if (!index.confirmationPolicy || index.confirmationPolicy.observationsRequired !== 2 || index.confirmationPolicy.minimumElapsedMinutes < 60) {
  throw new Error('Policy confirmation policy must require two observations separated by at least 60 minutes.');
}

const sourceIds = new Set();
let snapshotCount = 0;
let confirmedChangeCount = 0;
let legacyChangeCount = 0;
let pendingCount = 0;

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
  if (typeof snapshot.normalizedText !== 'string' || snapshot.normalizedText.length < 500) {
    throw new Error(`Snapshot text is missing/too short: ${relativePath}`);
  }
  if (sha256(snapshot.normalizedText) !== snapshot.hash) throw new Error(`Snapshot hash mismatch: ${relativePath}`);
  return snapshot;
}

for (const source of index.sources) {
  if (!source.id || sourceIds.has(source.id)) throw new Error(`Duplicate/invalid policy source id: ${source.id}`);
  sourceIds.add(source.id);
  if (!['apple', 'google'].includes(source.vendor)) throw new Error(`Invalid vendor for ${source.id}`);
  if (!['fresh', 'stale', 'unavailable'].includes(source.fetchStatus)) throw new Error(`Invalid fetchStatus for ${source.id}`);
  if (!Array.isArray(source.history) || !Array.isArray(source.changes)) throw new Error(`Missing history/changes for ${source.id}`);

  const snapshotsByHash = new Map();
  for (const entry of source.history) {
    if (!/^[a-f0-9]{64}$/.test(entry.hash)) throw new Error(`Invalid history hash for ${source.id}`);
    const snapshot = await loadSnapshot(entry.path);
    if (snapshot.sourceId !== source.id || snapshot.hash !== entry.hash) throw new Error(`History metadata mismatch for ${source.id}`);
    snapshotsByHash.set(entry.hash, entry.path);
    snapshotCount += 1;
  }

  if (source.current && !snapshotsByHash.has(source.current.hash)) throw new Error(`Current snapshot missing from history for ${source.id}`);

  if (source.pendingCandidate) {
    const pending = source.pendingCandidate;
    if (!/^[a-f0-9]{64}$/.test(pending.hash)) throw new Error(`Invalid pending hash for ${source.id}`);
    if (snapshotsByHash.get(pending.hash) !== pending.path) throw new Error(`Pending snapshot mismatch for ${source.id}`);
    if (source.current?.hash === pending.hash) throw new Error(`Pending hash equals current hash for ${source.id}`);
    if (!Number.isInteger(pending.observations) || pending.observations < 1) throw new Error(`Pending observations invalid for ${source.id}`);
    const first = Date.parse(pending.firstSeenAt);
    const last = Date.parse(pending.lastSeenAt);
    const minimum = Date.parse(pending.minimumConfirmationAt);
    if (![first, last, minimum].every(Number.isFinite) || last < first || minimum < first + 60 * 60 * 1000) {
      throw new Error(`Pending timing invalid for ${source.id}`);
    }
    pendingCount += 1;
  }

  const changeIds = new Set();
  for (const change of source.changes) {
    if (!/^[a-f0-9]{64}$/.test(change.id) || changeIds.has(change.id)) throw new Error(`Invalid/duplicate change id for ${source.id}`);
    changeIds.add(change.id);
    const expectedId = sha256(`${source.id}:${change.fromHash}:${change.toHash}`);
    if (expectedId !== change.id) throw new Error(`Policy change id mismatch for ${source.id}`);
    if (snapshotsByHash.get(change.fromHash) !== change.fromPath) throw new Error(`Change from-snapshot mismatch for ${source.id}`);
    if (snapshotsByHash.get(change.toHash) !== change.toPath) throw new Error(`Change to-snapshot mismatch for ${source.id}`);
    if (!['legacy_unconfirmed', 'confirmed_repeat'].includes(change.confirmationStatus)) throw new Error(`Invalid confirmationStatus for ${source.id}`);
    if (change.confirmationStatus === 'confirmed_repeat') {
      if (!Number.isInteger(change.observations) || change.observations < 2) throw new Error(`Confirmed change lacks repeated observations for ${source.id}`);
      const detected = Date.parse(change.detectedAt);
      const confirmed = Date.parse(change.confirmedAt);
      if (!Number.isFinite(detected) || !Number.isFinite(confirmed) || confirmed - detected < 60 * 60 * 1000) {
        throw new Error(`Confirmed change does not meet minimum stability window for ${source.id}`);
      }
      confirmedChangeCount += 1;
    } else {
      legacyChangeCount += 1;
    }
  }
}

console.log(`[policy-watch] validation PASS · ${index.sources.length} sources · ${snapshotCount} snapshots · confirmed ${confirmedChangeCount} · pending ${pendingCount} · legacy-unconfirmed ${legacyChangeCount} · ${index.runStatus}`);
