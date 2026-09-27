import { describe, expect, it } from 'vitest';
import { appRouteHash, parseAppRoute } from './appRouter';

describe('appRouter', () => {
  it('defaults empty or unknown hashes to Today', () => {
    expect(parseAppRoute('')).toEqual({ view: 'today' });
    expect(parseAppRoute('#/does-not-exist')).toEqual({ view: 'today' });
  });

  it('round-trips primary pages through GitHub Pages-safe hashes', () => {
    for (const view of ['today', 'trends', 'verification', 'saved', 'competitors', 'reviews', 'policy'] as const) {
      expect(parseAppRoute(appRouteHash({ view }))).toEqual({ view });
    }
  });

  it('preserves Analyze app and saved-run deep links', () => {
    expect(parseAppRoute('#/analyze?app=6761760135')).toEqual({ view: 'analyze', appId: '6761760135', runId: undefined });
    expect(parseAppRoute('#/analyze?run=11111111-1111-4111-8111-111111111111')).toEqual({
      view: 'analyze',
      appId: undefined,
      runId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('preserves Deep Verify session and evidence links', () => {
    const hash = appRouteHash({
      view: 'deep-verify',
      sessionId: '0123456789abcdef01234567',
      videoId: '22222222-2222-4222-8222-222222222222',
    });
    expect(hash).toBe('#/deep-verify?session=0123456789abcdef01234567&video=22222222-2222-4222-8222-222222222222');
    expect(parseAppRoute(hash)).toEqual({
      view: 'deep-verify',
      sessionId: '0123456789abcdef01234567',
      videoId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('drops malformed dynamic identifiers instead of trusting them', () => {
    expect(parseAppRoute('#/analyze?app=abc')).toEqual({ view: 'analyze', appId: undefined, runId: undefined });
    expect(parseAppRoute('#/deep-verify?session=bad&video=nope')).toEqual({ view: 'deep-verify', sessionId: undefined, videoId: undefined });
  });
});
