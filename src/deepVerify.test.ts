import { describe, expect, it } from 'vitest';
import {
  DEEP_VERIFY_MAX_BYTES,
  DEEP_VERIFY_MAX_SECONDS,
  DeepVerifyVerificationSessionSchema,
  DeepVerifyVideoPayloadSchema,
  formatTimestamp,
  normalizeYoutubeUrl,
  parseTimestampInput,
  sanitizeEvidenceFileName,
  validateUploadEvidence,
} from './deepVerify';

const validVerificationSession = {
  sessionId: '0123456789abcdef01234567',
  taskIds: [
    '111111111111111111111111',
    '222222222222222222222222',
    '333333333333333333333333',
  ],
  unknowns: [
    'Core mechanic has not been gameplay-verified.',
    'Monetization placement has not been verified in gameplay.',
    'Meta progression and retention systems have not been gameplay-verified.',
  ],
  categories: ['gameplay_mechanic', 'monetization_placement', 'meta_progression'],
  researchGeneratedAt: '2026-09-26T19:15:15.000Z',
} as const;

describe('Deep Verify evidence validation', () => {
  it('accepts a valid upload at the configured limits', () => {
    expect(() => validateUploadEvidence({
      sizeBytes: DEEP_VERIFY_MAX_BYTES,
      mimeType: 'video/mp4',
      durationSeconds: DEEP_VERIFY_MAX_SECONDS,
    })).not.toThrow();
  });

  it('rejects uploads over 500 MB', () => {
    expect(() => validateUploadEvidence({
      sizeBytes: DEEP_VERIFY_MAX_BYTES + 1,
      mimeType: 'video/mp4',
      durationSeconds: 30,
    })).toThrow(/500 MB/i);
  });

  it('rejects uploads over 30 minutes', () => {
    expect(() => validateUploadEvidence({
      sizeBytes: 1024,
      mimeType: 'video/webm',
      durationSeconds: DEEP_VERIFY_MAX_SECONDS + 0.01,
    })).toThrow(/30 minutes/i);
  });

  it('rejects unsupported file types', () => {
    expect(() => validateUploadEvidence({
      sizeBytes: 1024,
      mimeType: 'application/octet-stream',
      durationSeconds: 60,
    })).toThrow(/MP4, MOV, WebM, or M4V/i);
  });

  it('accepts canonical YouTube hosts and rejects lookalikes', () => {
    expect(normalizeYoutubeUrl('https://www.youtube.com/watch?v=abc123')).toContain('youtube.com/watch');
    expect(normalizeYoutubeUrl('https://youtu.be/abc123')).toContain('youtu.be/abc123');
    expect(() => normalizeYoutubeUrl('https://youtube.com.evil.example/watch?v=abc')).toThrow(/Only public YouTube/i);
    expect(() => normalizeYoutubeUrl('http://youtube.com/watch?v=abc')).toThrow(/HTTPS/i);
  });

  it('parses seconds, MM:SS and HH:MM:SS without interpolation', () => {
    expect(parseTimestampInput('90')).toBe(90);
    expect(parseTimestampInput('1:30')).toBe(90);
    expect(parseTimestampInput('0:01:30')).toBe(90);
    expect(() => parseTimestampInput('1:60')).toThrow(/below 60/i);
    expect(() => parseTimestampInput('31:00')).toThrow(/30-minute/i);
  });

  it('formats timestamps for evidence display', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(90)).toBe('1:30');
    expect(formatTimestamp(3661)).toBe('1:01:01');
  });

  it('sanitizes uploaded filenames without losing the extension', () => {
    expect(sanitizeEvidenceFileName(' My gameplay (final).mp4 ')).toBe('My_gameplay_final_.mp4');
  });

  it('accepts exact verification-session provenance with aligned atomic tasks', () => {
    const parsed = DeepVerifyVerificationSessionSchema.parse(validVerificationSession);
    expect(parsed.sessionId).toBe(validVerificationSession.sessionId);
    expect(parsed.taskIds).toHaveLength(3);
    expect(parsed.unknowns).toEqual(validVerificationSession.unknowns);
  });

  it('rejects verification-session provenance with mismatched cardinality', () => {
    const result = DeepVerifyVerificationSessionSchema.safeParse({
      ...validVerificationSession,
      categories: ['gameplay_mechanic', 'monetization_placement'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate verification task IDs', () => {
    const result = DeepVerifyVerificationSessionSchema.safeParse({
      ...validVerificationSession,
      taskIds: [
        '111111111111111111111111',
        '111111111111111111111111',
        '333333333333333333333333',
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed verification session IDs', () => {
    const result = DeepVerifyVerificationSessionSchema.safeParse({
      ...validVerificationSession,
      sessionId: 'not-a-session-id',
    });
    expect(result.success).toBe(false);
  });

  it('accepts an auditable completed analysis after the private source is deleted', () => {
    const payload = DeepVerifyVideoPayloadSchema.parse({
      videoId: '11111111-1111-4111-8111-111111111111',
      label: 'Gameplay verification',
      canonicalName: 'Example Game',
      storeId: '1234567890',
      sourceType: 'upload',
      storagePath: 'owner/video/gameplay.mp4',
      externalUrl: null,
      originalName: 'gameplay.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 12_000_000,
      durationSeconds: 120,
      status: 'completed',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      errorCode: null,
      errorMessage: null,
      deleteAfter: null,
      sourceDeletedAt: '2026-09-27T12:00:00.000Z',
      createdAt: '2026-09-26T10:00:00.000Z',
      verificationSession: validVerificationSession,
      latestAnalysis: {
        runId: '22222222-2222-4222-8222-222222222222',
        status: 'completed',
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        estimatedCostUsd: 0.0042,
        startedAt: '2026-09-26T10:05:00.000Z',
        completedAt: '2026-09-26T10:06:00.000Z',
        summary: 'Footage positively demonstrates the core puzzle loop.',
        unknowns: ['Long-term progression is not resolved by this footage.'],
        usage: { total_input_tokens: 1000, total_output_tokens: 200 },
      },
      events: [{
        eventId: '33333333-3333-4333-8333-333333333333',
        analysisRunId: '22222222-2222-4222-8222-222222222222',
        eventKey: 'mechanic',
        label: 'Core mechanic',
        claim: 'The player matches pieces on a grid.',
        startSeconds: 10,
        endSeconds: 20,
        origin: 'user_capture',
        interpretation: 'ai_inferred',
        coverage: 'partial',
        reviewState: 'human_confirmed',
        reviewedAt: '2026-09-26T11:00:00.000Z',
        confidence: 0.94,
        evidenceNote: 'Repeated interaction is visible in the supplied clip.',
      }],
    });

    expect(payload.sourceDeletedAt).toBeTruthy();
    expect(payload.verificationSession?.taskIds).toHaveLength(3);
    expect(payload.latestAnalysis?.unknowns).toHaveLength(1);
    expect(payload.events[0].reviewState).toBe('human_confirmed');
  });
});
