import { describe, expect, it } from 'vitest';
import type { DeepVerifyEvent } from './deepVerify';
import {
  VerificationTaskResolutionSchema,
  confirmedEventsForResolution,
  resolutionForTask,
  resolvedTaskCount,
} from './verificationResolution';

const events: DeepVerifyEvent[] = [
  {
    eventId: '11111111-1111-4111-8111-111111111111',
    analysisRunId: null,
    eventKey: 'mechanic',
    label: 'Mechanic',
    claim: 'The player drags a block into an empty lane.',
    startSeconds: 12,
    endSeconds: 20,
    origin: 'user_capture',
    interpretation: 'direct',
    coverage: 'verified',
    reviewState: 'human_confirmed',
    reviewedAt: '2026-09-26T20:00:00.000Z',
    confidence: 0.98,
    evidenceNote: null,
  },
  {
    eventId: '22222222-2222-4222-8222-222222222222',
    analysisRunId: null,
    eventKey: 'monetization',
    label: 'Monetization',
    claim: 'A rewarded-ad offer appears after the run.',
    startSeconds: 40,
    endSeconds: 45,
    origin: 'user_capture',
    interpretation: 'direct',
    coverage: 'verified',
    reviewState: 'unreviewed',
    reviewedAt: null,
    confidence: 0.9,
    evidenceNote: null,
  },
];

const resolved = VerificationTaskResolutionSchema.parse({
  resolutionId: '33333333-3333-4333-8333-333333333333',
  taskId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  sessionId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  sourceVideoId: '44444444-4444-4444-8444-444444444444',
  sourceEventId: events[0].eventId,
  unknownSnapshot: 'Core mechanic has not been gameplay-verified.',
  category: 'gameplay_mechanic',
  researchGeneratedAt: '2026-09-26T19:15:15.000Z',
  state: 'resolved',
  summary: events[0].claim,
  resolvedAt: '2026-09-26T20:05:00.000Z',
  createdAt: '2026-09-26T20:05:00.000Z',
  updatedAt: '2026-09-26T20:05:00.000Z',
});

describe('verification task resolution', () => {
  it('offers only category-matched human-confirmed events as closing evidence', () => {
    expect(confirmedEventsForResolution('gameplay_mechanic', events).map((event) => event.eventId)).toEqual([events[0].eventId]);
    expect(confirmedEventsForResolution('monetization_placement', events)).toHaveLength(0);
  });

  it('rejects a resolved shape without a cited event', () => {
    const result = VerificationTaskResolutionSchema.safeParse({ ...resolved, sourceEventId: null });
    expect(result.success).toBe(false);
  });

  it('finds and counts only explicitly resolved task overlays', () => {
    const open = VerificationTaskResolutionSchema.parse({
      ...resolved,
      resolutionId: '55555555-5555-4555-8555-555555555555',
      taskId: 'cccccccccccccccccccccccc',
      sourceEventId: null,
      state: 'needs_more_evidence',
      summary: 'Human kept this verification task open for more evidence.',
      resolvedAt: null,
    });
    const rows = [resolved, open];
    expect(resolutionForTask(rows, resolved.taskId)?.state).toBe('resolved');
    expect(resolvedTaskCount(rows, [resolved.taskId, open.taskId])).toBe(1);
  });
});
