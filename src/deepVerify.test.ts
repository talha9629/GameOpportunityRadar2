import { describe, expect, it } from 'vitest';
import {
  DEEP_VERIFY_MAX_BYTES,
  DEEP_VERIFY_MAX_SECONDS,
  formatTimestamp,
  normalizeYoutubeUrl,
  parseTimestampInput,
  sanitizeEvidenceFileName,
  validateUploadEvidence,
} from './deepVerify';

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
});
