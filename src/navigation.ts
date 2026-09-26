type DeepVerifyRequestListener = (appId: string) => void;

const deepVerifyListeners = new Set<DeepVerifyRequestListener>();

export function requestDeepVerifyByAppId(appId: string) {
  const normalized = appId.trim();
  if (!/^\d{5,}$/.test(normalized)) return false;
  for (const listener of deepVerifyListeners) listener(normalized);
  return true;
}

export function subscribeDeepVerifyRequests(listener: DeepVerifyRequestListener) {
  deepVerifyListeners.add(listener);
  return () => deepVerifyListeners.delete(listener);
}
