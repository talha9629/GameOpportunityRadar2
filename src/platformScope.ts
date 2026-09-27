export type PlatformScope = 'cross' | 'apple' | 'google_play' | 'amazon_fire';

export const PLATFORM_SCOPE_STORAGE_KEY = 'radar.platformScope.v1';

export const TRACKED_APPLE_MARKETS = [
  { code: 'us', label: 'United States', short: 'US' },
  { code: 'gb', label: 'United Kingdom', short: 'UK' },
  { code: 'ca', label: 'Canada', short: 'CA' },
  { code: 'au', label: 'Australia', short: 'AU' },
] as const;

export const PLATFORM_META: Record<PlatformScope, {
  label: string;
  shortLabel: string;
  status: 'live' | 'conditional' | 'assisted' | 'mixed';
  description: string;
}> = {
  cross: {
    label: 'Cross-platform',
    shortLabel: 'All',
    status: 'mixed',
    description: 'Coverage overview only. Select a store for store-specific evidence; incomparable ranks and provider positions are never blended.',
  },
  apple: {
    label: 'Apple App Store',
    shortLabel: 'Apple',
    status: 'live',
    description: 'Automated first-party Apple Games charts and public App Store metadata.',
  },
  google_play: {
    label: 'Google Play',
    shortLabel: 'Google Play',
    status: 'conditional',
    description: 'Automated Android discovery through AppBrain when its API key is configured; values remain third-party where applicable.',
  },
  amazon_fire: {
    label: 'Amazon Appstore · Fire',
    shortLabel: 'Amazon Fire',
    status: 'assisted',
    description: 'Fire tablet / Fire-device research mode. General Android-device Amazon Appstore support ended in 2025.',
  },
};

export function isPlatformScope(value: string | null): value is PlatformScope {
  return value === 'cross' || value === 'apple' || value === 'google_play' || value === 'amazon_fire';
}

export function canUseAppleOnlyEvidencePipeline(scope: PlatformScope): boolean {
  return scope === 'apple';
}
