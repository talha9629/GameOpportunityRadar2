const DEFAULT_NATIVE_DATA_ORIGIN = 'https://raw.githubusercontent.com/talha9629/GameOpportunityRadar2/main/public';

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function capacitorBridge(): CapacitorBridge | null {
  if (typeof globalThis === 'undefined') return null;
  const candidate = (globalThis as typeof globalThis & { Capacitor?: CapacitorBridge }).Capacitor;
  return candidate ?? null;
}

export function isNativeApp() {
  const bridge = capacitorBridge();
  if (!bridge) return false;
  if (typeof bridge.isNativePlatform === 'function') return bridge.isNativePlatform();
  return typeof bridge.getPlatform === 'function' && bridge.getPlatform() !== 'web';
}

function nativeDataOrigin() {
  const configured = import.meta.env.VITE_RADAR_NATIVE_DATA_ORIGIN?.trim().replace(/\/+$/, '');
  return configured || DEFAULT_NATIVE_DATA_ORIGIN;
}

export function publicDataUrl(relativePath: string) {
  const path = relativePath.replace(/^\/+/, '');
  if (isNativeApp()) return `${nativeDataOrigin()}/${path}`;
  return `${import.meta.env.BASE_URL}${path}`;
}
