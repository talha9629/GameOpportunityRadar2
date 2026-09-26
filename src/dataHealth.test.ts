import { describe, expect, it } from 'vitest';
import { isDeepVerifyTopCandidateAction, normalizeDataHealthAction } from './dataHealth';

describe('Data Health action routing', () => {
  it('recognizes the canonical generated Deep Verify action', () => {
    expect(isDeepVerifyTopCandidateAction('DEEP_VERIFY_TOP_CANDIDATE')).toBe(true);
  });

  it('normalizes action-code casing and surrounding whitespace', () => {
    expect(normalizeDataHealthAction('  deep_verify_top_candidate ')).toBe('DEEP_VERIFY_TOP_CANDIDATE');
    expect(isDeepVerifyTopCandidateAction(' deep_verify_top_candidate ')).toBe(true);
  });

  it('does not route unrelated actions to Deep Verify', () => {
    expect(isDeepVerifyTopCandidateAction('KEEP_COLLECTING_EXACT_HISTORY')).toBe(false);
    expect(isDeepVerifyTopCandidateAction('OPTIONAL_CONFIGURE_APPBRAIN')).toBe(false);
  });
});
