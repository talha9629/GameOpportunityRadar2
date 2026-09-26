import { describe, expect, it } from 'vitest';
import { GameplayDiscoverySchema, discoveryForSession } from './gameplayDiscovery';

const sessionId = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function payload() {
  return {
    schemaVersion: 1 as const,
    generatedAt: '2026-09-27T00:00:00.000Z',
    verificationGeneratedAt: '2026-09-26T23:59:00.000Z',
    statement: 'Public gameplay discovery proposes search candidates only. Search results are never verified evidence without Deep Verify and human review.',
    provider: {
      name: 'Tavily' as const,
      status: 'complete' as const,
      sourceOrigin: 'third_party_public_search' as const,
      sourceMode: 'assisted' as const,
      searchDepth: 'basic' as const,
      creditModel: 'basic_search_1_credit_per_request' as const,
      dailyCreditCap: 8,
      creditsUsedThisRun: 1,
      attemptedSessions: 1,
      successfulSearches: 1,
      failedSearches: 0,
      note: 'Search candidates remain suggestions until inspected and saved into owner-authenticated Deep Verify.',
    },
    sessions: [{
      sessionId,
      appId: '6761760135',
      name: 'Meowdoku!',
      queueRank: 1,
      query: '"Meowdoku!" gameplay walkthrough menu monetization progression',
      searchedAt: '2026-09-27T00:00:00.000Z',
      status: 'found' as const,
      error: null,
      candidates: [{
        rank: 1,
        url: 'https://www.youtube.com/watch?v=abc123',
        title: 'Meowdoku gameplay',
        snippet: 'Gameplay result candidate.',
        score: 0.8,
        domain: 'youtube.com' as const,
        sourceOrigin: 'third_party_public' as const,
        interpretation: 'search_candidate' as const,
        reviewState: 'suggested' as const,
      }],
    }],
  };
}

describe('GameplayDiscoverySchema', () => {
  it('accepts a bounded suggested YouTube source candidate', () => {
    const parsed = GameplayDiscoverySchema.parse(payload());
    expect(discoveryForSession(parsed, sessionId)?.candidates[0].reviewState).toBe('suggested');
  });

  it('rejects non-YouTube or non-watch URLs', () => {
    const next = payload();
    next.sessions[0].candidates[0].url = 'https://example.com/video';
    expect(GameplayDiscoverySchema.safeParse(next).success).toBe(false);
  });

  it('rejects credit use beyond the hard cap', () => {
    const next = payload();
    next.provider.dailyCreditCap = 1;
    next.provider.creditsUsedThisRun = 2;
    next.provider.attemptedSessions = 2;
    expect(GameplayDiscoverySchema.safeParse(next).success).toBe(false);
  });

  it('rejects unconfigured sessions that contain search output', () => {
    const next = payload();
    next.provider.status = 'unconfigured';
    next.provider.creditsUsedThisRun = 0;
    next.provider.attemptedSessions = 0;
    next.provider.successfulSearches = 0;
    next.sessions[0].status = 'unconfigured';
    expect(GameplayDiscoverySchema.safeParse(next).success).toBe(false);
  });
});
