export function isExactSuccessfulGooglePlaySnapshot(snapshot, chartDepth = 50) {
  if (snapshot?.status !== 'ok' || !Array.isArray(snapshot.entries) || snapshot.entries.length !== chartDepth) return false;
  if (typeof snapshot.generatedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.generatedAt))) return false;
  const packages = snapshot.entries.map((entry) => String(entry?.packageName ?? '').trim());
  return packages.every(Boolean) && new Set(packages).size === chartDepth;
}

export function selectLatestSuccessfulGooglePlaySnapshot(latest, historySnapshots, chartDepth = 50) {
  const candidates = [latest, ...(Array.isArray(historySnapshots) ? historySnapshots : [])]
    .filter((snapshot) => isExactSuccessfulGooglePlaySnapshot(snapshot, chartDepth));
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))[0];
}

export function unconfiguredStateIsSemanticallyUnchanged(previous, next) {
  if (previous?.status !== 'unconfigured' || next?.status !== 'unconfigured') return false;
  if (typeof previous.generatedAt !== 'string') return false;
  return JSON.stringify(previous) === JSON.stringify({ ...next, generatedAt: previous.generatedAt });
}
