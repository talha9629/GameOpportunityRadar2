import { describe, expect, it } from 'vitest';
import {
  DeepVerifyVideoPayloadSchema,
  DeepVerifyVideoSummaryRowSchema,
  DeepVerifyVideoSummarySchema,
  type DeepVerifyVerificationSession,
} from './deepVerify';
import { assertDeepVerifySessionStorefront } from './storefrontDeepVerifyApi';

const session: DeepVerifyVerificationSession = {
  sessionId: 'a'.repeat(24),
  taskIds: ['b'.repeat(24)],
  unknowns: ['Verify the core gameplay mechanic from cited footage.'],
  categories: ['gameplay_mechanic'],
  researchGeneratedAt: '2026-09-27T12:00:00+00:00',
};

describe('storefront-qualified Deep Verify contracts', () => {
  it('parses storefront provenance in summary rows and mapped summaries', () => {
    const row = DeepVerifyVideoSummaryRowSchema.parse({
      video_id: '11111111-1111-4111-8111-111111111111',
      label: 'Google gameplay',
      canonical_name: null,
      storefront: 'google_play',
      store_id: 'com.example.game',
      source_type: 'youtube_url',
      status: 'evidence_ready',
      provider: null,
      model: null,
      original_name: null,
      size_bytes: null,
      duration_seconds: null,
      delete_after: null,
      source_deleted_at: null,
      created_at: '2026-09-27T12:00:00+00:00',
      event_count: 0,
    });
    expect(row.storefront).toBe('google_play');

    const summary = DeepVerifyVideoSummarySchema.parse({
      videoId: row.video_id,
      label: row.label,
      canonicalName: row.canonical_name,
      storefront: row.storefront,
      storeId: row.store_id,
      sourceType: row.source_type,
      status: row.status,
      provider: row.provider,
      model: row.model,
      originalName: row.original_name,
      sizeBytes: row.size_bytes,
      durationSeconds: row.duration_seconds,
      deleteAfter: row.delete_after,
      sourceDeletedAt: row.source_deleted_at,
      createdAt: row.created_at,
      eventCount: row.event_count,
    });
    expect(summary.storefront).toBe('google_play');
  });

  it('parses storefront provenance in loaded evidence payloads', () => {
    const payload = DeepVerifyVideoPayloadSchema.parse({
      videoId: '22222222-2222-4222-8222-222222222222',
      label: 'Amazon gameplay',
      canonicalName: null,
      storefront: 'amazon_appstore',
      storeId: 'B0EXAMPLE',
      sourceType: 'youtube_url',
      storagePath: null,
      externalUrl: 'https://www.youtube.com/watch?v=example',
      originalName: null,
      mimeType: null,
      sizeBytes: null,
      durationSeconds: null,
      status: 'evidence_ready',
      provider: null,
      model: null,
      errorCode: null,
      errorMessage: null,
      deleteAfter: null,
      sourceDeletedAt: null,
      createdAt: '2026-09-27T12:00:00+00:00',
      verificationSession: null,
      latestAnalysis: null,
      events: [],
    });
    expect(payload.storefront).toBe('amazon_appstore');
  });

  it('allows generated verification sessions only for Apple', () => {
    expect(assertDeepVerifySessionStorefront('apple_app_store', session)?.sessionId).toBe(session.sessionId);
    expect(() => assertDeepVerifySessionStorefront('google_play', session)).toThrow(/Apple-only/);
    expect(() => assertDeepVerifySessionStorefront('amazon_appstore', session)).toThrow(/Apple-only/);
    expect(assertDeepVerifySessionStorefront('google_play', null)).toBeNull();
  });
});
