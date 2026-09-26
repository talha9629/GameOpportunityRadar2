import { describe, expect, it } from 'vitest';
import { SavedDossierPayloadSchema, SavedDossierSummaryRowSchema } from './saved';

const dossier = {
  game: {
    platform: 'ios',
    storeId: '6761760135',
    canonicalName: 'Meowdoku!',
    publisher: 'OAKEVER GAMES PTE. LTD.',
    storeUrl: 'https://apps.apple.com/us/app/id6761760135',
    iconUrl: null,
    description: 'Puzzle description',
    rating: 4.8,
    ratingCount: 100,
    releaseDate: '2026-01-01T00:00:00Z',
    currentVersionReleaseDate: '2026-09-01T00:00:00Z',
    screenshots: [],
  },
  findings: [{
    id: 'finding-1',
    key: 'publisher',
    label: 'Publisher',
    value: 'OAKEVER GAMES PTE. LTD.',
    origin: 'official_public',
    interpretation: 'direct',
    coverage: 'verified',
    reviewState: 'human_confirmed',
    confidence: 1,
    evidenceLabel: 'Apple store metadata',
  }],
  unknowns: ['Gameplay has not been verified.'],
  sourceMode: 'automated',
};

describe('saved dossier schemas', () => {
  it('accepts an exact reload payload with reviewed findings and scorecard state', () => {
    const parsed = SavedDossierPayloadSchema.parse({
      runId: '5bb59c0d-0fee-4c09-9608-19e62a0a7d39',
      savedAt: '2026-09-26T12:00:00Z',
      dossier,
      scorecard: {
        momentum: null,
        soloFit: 4,
        differentiation: 3,
        saturation: null,
        risk: 2,
        confidence: 3,
        hardBlocks: [],
      },
      decision: { status: 'VERIFY', reasons: ['Critical score dimensions still need evidence.'] },
    });

    expect(parsed.dossier.findings[0].reviewState).toBe('human_confirmed');
    expect(parsed.scorecard.soloFit).toBe(4);
  });

  it('rejects malformed cloud state instead of hydrating it', () => {
    expect(() => SavedDossierPayloadSchema.parse({
      runId: 'not-a-uuid',
      savedAt: null,
      dossier,
      scorecard: { momentum: 9 },
      decision: { status: 'BUILD NOW', reasons: [] },
    })).toThrow();
  });

  it('coerces Postgres bigint counts from RPC rows', () => {
    const row = SavedDossierSummaryRowSchema.parse({
      run_id: '5bb59c0d-0fee-4c09-9608-19e62a0a7d39',
      game_id: 'a10c4c52-6a6d-43c5-a432-327334e54c2c',
      canonical_name: 'Meowdoku!',
      publisher: null,
      platform: 'ios',
      store_id: '6761760135',
      decision_status: 'VERIFY',
      reviewed_count: '1',
      finding_count: '9',
      saved_at: '2026-09-26T12:00:00Z',
    });

    expect(row.reviewed_count).toBe(1);
    expect(row.finding_count).toBe(9);
  });
});
