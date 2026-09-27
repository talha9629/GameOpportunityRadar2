import { describe, expect, it } from 'vitest';
import { StorefrontSchema, STOREFRONT_META, storefrontForScope } from './storeIdentity';

describe('storefront identity', () => {
  it('keeps storefront distinct from OS platform', () => {
    expect(StorefrontSchema.options).toEqual(['apple_app_store', 'google_play', 'amazon_appstore']);
    expect(STOREFRONT_META.apple_app_store.platform).toBe('ios');
    expect(STOREFRONT_META.google_play.platform).toBe('android');
    expect(STOREFRONT_META.amazon_appstore.platform).toBe('android');
  });

  it('maps explicit research scopes to one storefront and leaves cross unqualified', () => {
    expect(storefrontForScope('apple')).toBe('apple_app_store');
    expect(storefrontForScope('google_play')).toBe('google_play');
    expect(storefrontForScope('amazon_fire')).toBe('amazon_appstore');
    expect(storefrontForScope('cross')).toBeNull();
  });
});
