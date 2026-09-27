import { describe, expect, it } from 'vitest';
import { GameplayDiscoverySchema, discoveryForSession } from './gameplayDiscovery';

const sessionId = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function legacyTavilyPayload(status: 'complete' | 'unconfigured' = 'complete'): Record<string, any> {
  const configured = status === 'complete';
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-27T00:00:00.000Z',
    verificationGeneratedAt: '2026-09-26T23:59:00.000Z',
    statement: 'Public gameplay discovery proposes search candidates only. Search results are never verified evidence without Deep Verify and human review.',
    provider: {
      name: 'Tavily',
      status,
      sourceOrigin: 'third_party_public_search',
      sourceMode: 'assisted',
      searchDepth: 'basic',
      creditModel: 'basic_search_1_credit_per_request',
      dailyCreditCap: 8,
      creditsUsedThisRun: configured ? 1 : 0,
      attemptedSessions: configured ? 1 : 0,
      successfulSearches: configured ? 1 : 0,
      failedSearches: 0,
      note: configured
        ? 'Search candidates remain suggestions until inspected and saved into owner-authenticated Deep Verify.'
        : 'TAVILY_API_KEY is not configured. Gameplay discovery remains optional.',
    },
    sessions: [{
      sessionId,
      appId: '6761760135',
      name: 'Meowdoku!',
      queueRank: 1,
      query: '"Meowdoku!" gameplay walkthrough menu monetization progression',
      searchedAt: configured ? '2026-09-27T00:00:00.000Z' : null,
      status: configured ? 'found' : 'unconfigured',
      error: null,
      candidates: configured ? [{
        rank: 1,
        url: 'https://www.youtube.com/watch?v=abc123',
        title: 'Meowdoku gameplay',
        snippet: 'Gameplay result candidate.',
        score: 0.8,
        domain: 'youtube.com',
        sourceOrigin: 'third_party_public',
        interpretation: 'search_candidate',
        reviewState: 'suggested',
      }] : [],
    }],
  };
}

function geminiPayload(): Record<string, any> {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-27T01:00:00.000Z',
    verificationGeneratedAt: '2026-09-27T00:59:00.000Z',
    statement: 'Public gameplay discovery proposes search candidates only. A URL is not gameplay evidence until it is saved into Deep Verify and reviewed.',
    provider: {
      key: 'gemini_google_search',
      name: 'Gemini Search',
      status: 'complete',
      sourceOrigin: 'third_party_public_search',
      sourceMode: 'assisted',
      mode: 'gemini_google_search_grounding',
      model: 'gemini-3.8-flash',
      costModel: 'gemini_3_search_queries_reported_by_grounding_metadata',
      dailyRequestCap: 8,
      requestsUsedThisRun: 1,
      searchQueriesUsedThisRun: 2,
      attemptedSessions: 1,
      successfulSearches: 1,
      failedSearches: 0,
      note: 'Gemini uses Google Search grounding and public YouTube availability is independently checked through oEmbed.',
    },
    sessions: [{
      sessionId,
      appId: '6761760135',
      name: 'Meowdoku!',
      queueRank: 1,
      query: '"Meowdoku!" gameplay walkthrough menu monetization progression',
      providerKey: 'gemini_google_search',
      searchQueries: ['Meowdoku gameplay walkthrough', 'Meowdoku progression monetization gameplay'],
      searchedAt: '2026-09-27T01:00:00.000Z',
      status: 'found',
      error: null,
      candidates: [{
        rank: 1,
        url: 'https://www.youtube.com/watch?v=xyz789',
        title: 'Meowdoku Gameplay Walkthrough',
        snippet: 'Suggested by grounded search; content remains unverified by discovery.',
        score: null,
        channelName: 'Example Channel',
        thumbnailUrl: 'https://i.ytimg.com/vi/xyz789/hqdefault.jpg',
        availabilityVerifiedAt: '2026-09-27T01:00:01.000Z',
        discoveryProvider: 'gemini_google_search',
        domain: 'youtube.com',
        sourceOrigin: 'third_party_public',
        interpretation: 'search_candidate',
        reviewState: 'suggested',
      }],
    }],
  };
}

describe('GameplayDiscoverySchema', () => {
  it('normalizes a legacy Tavily v1 artifact without inventing oEmbed verification', () => {
    const parsed = GameplayDiscoverySchema.parse(legacyTavilyPayload());
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.provider.key).toBe('tavily');
    expect(parsed.provider.requestsUsedThisRun).toBe(1);
    expect(parsed.provider.searchQueriesUsedThisRun).toBe(1);
    const candidate = discoveryForSession(parsed, sessionId)?.candidates[0];
    expect(candidate?.reviewState).toBe('suggested');
    expect(candidate?.availabilityVerifiedAt).toBeNull();
    expect(candidate?.discoveryProvider).toBe('tavily');
  });

  it('normalizes a legacy unconfigured artifact to the provider-neutral none state', () => {
    const parsed = GameplayDiscoverySchema.parse(legacyTavilyPayload('unconfigured'));
    expect(parsed.provider.key).toBe('none');
    expect(parsed.provider.name).toBe('None');
    expect(parsed.provider.requestsUsedThisRun).toBe(0);
    expect(parsed.sessions[0].providerKey).toBe('none');
    expect(parsed.sessions[0].status).toBe('unconfigured');
  });

  it('accepts Gemini Google Search grounding provenance with oEmbed-checked public video metadata', () => {
    const parsed = GameplayDiscoverySchema.parse(geminiPayload());
    expect(parsed.provider.key).toBe('gemini_google_search');
    expect(parsed.provider.searchQueriesUsedThisRun).toBe(2);
    const candidate = discoveryForSession(parsed, sessionId)?.candidates[0];
    expect(candidate?.availabilityVerifiedAt).toBe('2026-09-27T01:00:01.000Z');
    expect(candidate?.channelName).toBe('Example Channel');
    expect(candidate?.interpretation).toBe('search_candidate');
  });

  it('rejects non-YouTube or non-watch candidate URLs', () => {
    const next = geminiPayload();
    next.sessions[0].candidates[0].url = 'https://example.com/video';
    expect(GameplayDiscoverySchema.safeParse(next).success).toBe(false);
  });

  it('rejects provider request use beyond the hard cap', () => {
    const next = geminiPayload();
    next.provider.dailyRequestCap = 1;
    next.provider.requestsUsedThisRun = 2;
    next.provider.attemptedSessions = 2;
    next.provider.successfulSearches = 2;
    expect(GameplayDiscoverySchema.safeParse(next).success).toBe(false);
  });

  it('rejects unconfigured sessions that contain search output', () => {
    const next = geminiPayload();
    next.provider = {
      ...next.provider,
      key: 'none',
      name: 'None',
      status: 'unconfigured',
      mode: 'unconfigured',
      model: null,
      costModel: 'unconfigured',
      requestsUsedThisRun: 0,
      searchQueriesUsedThisRun: 0,
      attemptedSessions: 0,
      successfulSearches: 0,
      failedSearches: 0,
    };
    next.sessions[0].providerKey = 'none';
    next.sessions[0].status = 'unconfigured';
    expect(GameplayDiscoverySchema.safeParse(next).success).toBe(false);
  });
});
