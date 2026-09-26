import { z } from 'zod';
import { CoverageSchema, InterpretationSchema, OriginSchema, ReviewStateSchema } from './domain';

export const DEEP_VERIFY_MAX_BYTES = 524_288_000;
export const DEEP_VERIFY_MAX_SECONDS = 1_800;
export const DEEP_VERIFY_BUCKET = 'deep-verify';
export const DEEP_VERIFY_ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
] as const;

export const DeepVerifySourceTypeSchema = z.enum(['upload', 'youtube_url']);
export type DeepVerifySourceType = z.infer<typeof DeepVerifySourceTypeSchema>;

export const DeepVerifyStatusSchema = z.enum([
  'evidence_ready',
  'provider_required',
  'queued',
  'analyzing',
  'completed',
  'failed',
]);
export type DeepVerifyStatus = z.infer<typeof DeepVerifyStatusSchema>;

export const DeepVerifyVideoSummaryRowSchema = z.object({
  video_id: z.string().uuid(),
  label: z.string().min(1),
  canonical_name: z.string().nullable(),
  store_id: z.string().nullable(),
  source_type: DeepVerifySourceTypeSchema,
  status: DeepVerifyStatusSchema,
  provider: z.string().nullable(),
  model: z.string().nullable(),
  original_name: z.string().nullable(),
  size_bytes: z.coerce.number().nonnegative().nullable(),
  duration_seconds: z.coerce.number().nonnegative().nullable(),
  delete_after: z.string().nullable(),
  created_at: z.string(),
  event_count: z.coerce.number().int().nonnegative(),
});

export const DeepVerifyVideoSummarySchema = z.object({
  videoId: z.string().uuid(),
  label: z.string().min(1),
  canonicalName: z.string().nullable(),
  storeId: z.string().nullable(),
  sourceType: DeepVerifySourceTypeSchema,
  status: DeepVerifyStatusSchema,
  provider: z.string().nullable(),
  model: z.string().nullable(),
  originalName: z.string().nullable(),
  sizeBytes: z.number().nonnegative().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  deleteAfter: z.string().nullable(),
  createdAt: z.string(),
  eventCount: z.number().int().nonnegative(),
});

export const DeepVerifyEventSchema = z.object({
  eventId: z.string().uuid(),
  analysisRunId: z.string().uuid().nullable(),
  eventKey: z.string().min(1),
  label: z.string().min(1),
  claim: z.string().min(1).max(4000),
  startSeconds: z.coerce.number().min(0).max(DEEP_VERIFY_MAX_SECONDS),
  endSeconds: z.coerce.number().min(0).max(DEEP_VERIFY_MAX_SECONDS).nullable(),
  origin: OriginSchema,
  interpretation: InterpretationSchema,
  coverage: CoverageSchema,
  reviewState: ReviewStateSchema,
  reviewedAt: z.string().nullable().optional(),
  confidence: z.coerce.number().min(0).max(1),
  evidenceNote: z.string().nullable(),
}).superRefine((value, context) => {
  if (value.endSeconds != null && value.endSeconds < value.startSeconds) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endSeconds'], message: 'End timestamp cannot precede start timestamp.' });
  }
});

export const DeepVerifyVideoPayloadSchema = z.object({
  videoId: z.string().uuid(),
  label: z.string().min(1),
  canonicalName: z.string().nullable(),
  storeId: z.string().nullable(),
  sourceType: DeepVerifySourceTypeSchema,
  storagePath: z.string().nullable(),
  externalUrl: z.string().nullable(),
  originalName: z.string().nullable(),
  mimeType: z.string().nullable(),
  sizeBytes: z.coerce.number().nonnegative().nullable(),
  durationSeconds: z.coerce.number().nonnegative().nullable(),
  status: DeepVerifyStatusSchema,
  provider: z.string().nullable(),
  model: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  deleteAfter: z.string().nullable(),
  createdAt: z.string(),
  events: z.array(DeepVerifyEventSchema),
});

export const DeepVerifyEventDraftSchema = z.object({
  eventKey: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  claim: z.string().trim().min(1).max(4000),
  startSeconds: z.number().min(0).max(DEEP_VERIFY_MAX_SECONDS),
  endSeconds: z.number().min(0).max(DEEP_VERIFY_MAX_SECONDS).nullable(),
  origin: OriginSchema,
  interpretation: InterpretationSchema,
  coverage: CoverageSchema,
  confidence: z.number().min(0).max(1),
  evidenceNote: z.string().trim().max(1000).nullable(),
}).superRefine((value, context) => {
  if (value.endSeconds != null && value.endSeconds < value.startSeconds) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endSeconds'], message: 'End timestamp cannot precede start timestamp.' });
  }
});

export type DeepVerifyVideoSummary = z.infer<typeof DeepVerifyVideoSummarySchema>;
export type DeepVerifyEvent = z.infer<typeof DeepVerifyEventSchema>;
export type DeepVerifyVideoPayload = z.infer<typeof DeepVerifyVideoPayloadSchema>;
export type DeepVerifyEventDraft = z.infer<typeof DeepVerifyEventDraftSchema>;

export function validateUploadEvidence(input: { sizeBytes: number; mimeType: string; durationSeconds: number }) {
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 1) throw new Error('The selected video is empty or unreadable.');
  if (input.sizeBytes > DEEP_VERIFY_MAX_BYTES) throw new Error('Deep Verify accepts videos up to 500 MB.');
  if (!DEEP_VERIFY_ALLOWED_MIME_TYPES.includes(input.mimeType as (typeof DEEP_VERIFY_ALLOWED_MIME_TYPES)[number])) {
    throw new Error('Use MP4, MOV, WebM, or M4V video evidence.');
  }
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) throw new Error('Could not verify this video duration.');
  if (input.durationSeconds > DEEP_VERIFY_MAX_SECONDS) throw new Error('Deep Verify accepts videos up to 30 minutes.');
}

export function normalizeYoutubeUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw.trim()); }
  catch { throw new Error('Enter a valid public YouTube URL.'); }
  if (url.protocol !== 'https:') throw new Error('YouTube evidence must use HTTPS.');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const isYoutube = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
  if (!isYoutube) throw new Error('Only public YouTube URLs are supported for external video evidence.');
  return url.toString();
}

export function sanitizeEvidenceFileName(raw: string) {
  const trimmed = raw.trim();
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[_\.]+/, '');
  const result = safe.slice(-120);
  return result || 'video';
}

export function parseTimestampInput(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error('Timestamp is required.');
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const seconds = Number(value);
    if (seconds > DEEP_VERIFY_MAX_SECONDS) throw new Error('Timestamp exceeds the 30-minute evidence limit.');
    return seconds;
  }
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+(?:\.\d+)?$/.test(part))) {
    throw new Error('Use seconds, MM:SS, or HH:MM:SS.');
  }
  const numbers = parts.map(Number);
  const secondsPart = numbers[numbers.length - 1];
  const minutesPart = numbers[numbers.length - 2];
  if (secondsPart >= 60 || minutesPart >= 60) throw new Error('Timestamp seconds and minutes must be below 60.');
  const total = parts.length === 2
    ? minutesPart * 60 + secondsPart
    : numbers[0] * 3600 + minutesPart * 60 + secondsPart;
  if (total > DEEP_VERIFY_MAX_SECONDS) throw new Error('Timestamp exceeds the 30-minute evidence limit.');
  return total;
}

export function formatTimestamp(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
