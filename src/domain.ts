import { z } from 'zod';

export const PlatformSchema = z.enum(['ios', 'android']);
export type Platform = z.infer<typeof PlatformSchema>;

export const ReviewStateSchema = z.enum([
  'unreviewed',
  'human_confirmed',
  'human_rejected',
  'needs_more_evidence',
]);
export type ReviewState = z.infer<typeof ReviewStateSchema>;

export const CoverageSchema = z.enum(['verified', 'partial', 'inferred', 'unknown']);
export type Coverage = z.infer<typeof CoverageSchema>;

export const InterpretationSchema = z.enum(['direct', 'ai_inferred', 'human_inferred']);
export type Interpretation = z.infer<typeof InterpretationSchema>;

export const OriginSchema = z.enum([
  'official_public',
  'third_party_public',
  'third_party_estimate',
  'publisher_report',
  'user_capture',
  'human_input',
]);
export type Origin = z.infer<typeof OriginSchema>;

export const GameInputSchema = z
  .string()
  .trim()
  .min(2)
  .max(500);

export const StoreGameSchema = z.object({
  platform: PlatformSchema,
  storeId: z.string().min(1),
  canonicalName: z.string().min(1),
  publisher: z.string().nullable(),
  storeUrl: z.string().url(),
  iconUrl: z.string().url().nullable(),
  description: z.string().nullable(),
  rating: z.number().nullable(),
  ratingCount: z.number().int().nonnegative().nullable(),
  releaseDate: z.string().nullable(),
  currentVersionReleaseDate: z.string().nullable(),
  screenshots: z.array(z.string().url()),
});
export type StoreGame = z.infer<typeof StoreGameSchema>;

export const StoreCandidateSchema = z.object({
  storeId: z.string().min(1),
  canonicalName: z.string().min(1),
  publisher: z.string().nullable(),
  storeUrl: z.string().url(),
  iconUrl: z.string().url().nullable(),
});
export type StoreCandidate = z.infer<typeof StoreCandidateSchema>;

export const CandidateSearchResultSchema = z.object({
  query: z.string(),
  candidates: z.array(StoreCandidateSchema).min(1),
});
export type CandidateSearchResult = z.infer<typeof CandidateSearchResultSchema>;

export const FindingSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  value: z.string(),
  origin: OriginSchema,
  interpretation: InterpretationSchema,
  coverage: CoverageSchema,
  reviewState: ReviewStateSchema,
  confidence: z.number().min(0).max(1),
  evidenceLabel: z.string(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const AnalysisResultSchema = z.object({
  game: StoreGameSchema,
  findings: z.array(FindingSchema),
  unknowns: z.array(z.string()),
  sourceMode: z.enum(['automated', 'assisted', 'manual']),
  sourceObservedAt: z.string().datetime(),
  rawSource: z.record(z.string(), z.unknown()).optional(),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
