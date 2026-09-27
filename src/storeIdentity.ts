import { z } from 'zod';
import type { PlatformScope } from './platformScope';

export const StorefrontSchema = z.enum(['apple_app_store', 'google_play', 'amazon_appstore']);
export type Storefront = z.infer<typeof StorefrontSchema>;

export const STOREFRONT_META: Record<Storefront, {
  label: string;
  shortLabel: string;
  idLabel: string;
  platform: 'ios' | 'android';
}> = {
  apple_app_store: {
    label: 'Apple App Store',
    shortLabel: 'Apple',
    idLabel: 'Apple ID',
    platform: 'ios',
  },
  google_play: {
    label: 'Google Play',
    shortLabel: 'Google Play',
    idLabel: 'Android package',
    platform: 'android',
  },
  amazon_appstore: {
    label: 'Amazon Appstore',
    shortLabel: 'Amazon',
    idLabel: 'Amazon app ID / package',
    platform: 'android',
  },
};

export function storefrontForScope(scope: PlatformScope): Storefront | null {
  if (scope === 'apple') return 'apple_app_store';
  if (scope === 'google_play') return 'google_play';
  if (scope === 'amazon_fire') return 'amazon_appstore';
  return null;
}

export function storefrontLabel(storefront: Storefront | null | undefined): string {
  return storefront ? STOREFRONT_META[storefront].label : 'Unlinked';
}
