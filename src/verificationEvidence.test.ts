import { describe, expect, it } from 'vitest';
import {
  VerificationSessionEvidenceSchema,
  evidenceCountForSession,
  latestEvidenceForSession,
  type VerificationSessionEvidence,
} from './verificationEvidence';

const sessionA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const sessionB = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const evidence: VerificationSessionEvidence[] = [
  {
    videoId: '11111111-1111-4111-8111-111111111111',
    label: 'Older capture',
    storeId: '1234567890',
    sourceType: 'upload',
    status: 'evidence_ready',
    sessionId: sessionA,
    taskIds: ['111111111111111111111111'],
    researchGeneratedAt: '2026-09-26T19:00:00.000Z',
    createdAt: '2026-09-26T19:05:00.000Z',
  },
  {
    videoId: '22222222-2222-4222-8222-222222222222',
    label: 'Newer capture',
    storeId: '1234567890',
    sourceType: 'youtube_url',
    status: 'completed',
    sessionId: sessionA,
    taskIds: ['111111111111111111111111'],
    researchGeneratedAt: '2026-09-26T19:00:00.000Z',
    createdAt: '2026-09-26T20:05:00.000Z',
  },
  {
    videoId: '33333333-3333-4333-8333-333333333333',
    label: 'Other session',
    storeId: '9876543210',
    sourceType: 'upload',
    status: 'evidence_ready',
    sessionId: sessionB,
    taskIds: ['333333333333333333333333'],
    researchGeneratedAt: '2026-09-26T19:00:00.000Z',
    createdAt: '2026-09-26T20:10:00.000Z',
  },
];

describe('verification evidence progress', () => {
  it('validates owner-linked session evidence rows without upgrading claim status', () => {
    const parsed = VerificationSessionEvidenceSchema.parse(evidence[0]);
    expect(parsed.sessionId).toBe(sessionA);
    expect(parsed.status).toBe('evidence_ready');
  });

  it('counts only evidence linked to the exact capture session', () => {
    expect(evidenceCountForSession(evidence, sessionA)).toBe(2);
    expect(evidenceCountForSession(evidence, sessionB)).toBe(1);
    expect(evidenceCountForSession(evidence, 'cccccccccccccccccccccccc')).toBe(0);
  });

  it('returns the newest linked source without calling the session resolved', () => {
    const latest = latestEvidenceForSession(evidence, sessionA);
    expect(latest?.videoId).toBe('22222222-2222-4222-8222-222222222222');
    expect(latest?.status).toBe('completed');
  });

  it('returns null when no exact session evidence exists', () => {
    expect(latestEvidenceForSession(evidence, 'cccccccccccccccccccccccc')).toBeNull();
  });
});
