import { describe, expect, it, vi } from 'vitest';
import { requestDeepVerifyByAppId, subscribeDeepVerifyRequests } from './navigation';

describe('Deep Verify navigation requests', () => {
  it('normalizes and emits a valid Apple app ID', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDeepVerifyRequests(listener);

    expect(requestDeepVerifyByAppId(' 6761760135 ')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('6761760135');

    unsubscribe();
  });

  it('rejects invalid IDs without emitting a request', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDeepVerifyRequests(listener);

    expect(requestDeepVerifyByAppId('not-an-id')).toBe(false);
    expect(requestDeepVerifyByAppId('1234')).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('stops emitting after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDeepVerifyRequests(listener);
    unsubscribe();

    expect(requestDeepVerifyByAppId('6761760135')).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });
});
