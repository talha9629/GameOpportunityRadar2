import { z } from 'zod';

export const ReviewClusterKeySchema = z.enum([
  'positive',
  'negative',
  'ads',
  'difficulty',
  'monetization',
  'repetition',
  'bugs',
  'requests',
  'quit_reasons',
]);

export type ReviewClusterKey = z.infer<typeof ReviewClusterKeySchema>;

export const ReviewEntrySchema = z.object({
  sequence: z.number().int().positive(),
  rating: z.number().int().min(1).max(5).nullable(),
  text: z.string().min(1).max(4000),
  labels: z.array(ReviewClusterKeySchema),
});

export const ReviewClusterSchema = z.object({
  clusterKey: ReviewClusterKeySchema,
  label: z.string().min(1),
  reviewCount: z.number().int().nonnegative(),
  sampleShare: z.number().min(0).max(1),
  evidenceSequences: z.array(z.number().int().positive()),
});

export const ReviewSampleAnalysisSchema = z.object({
  analysisMethod: z.literal('keyword_rules_v1'),
  entries: z.array(ReviewEntrySchema).min(1).max(500),
  clusters: z.array(ReviewClusterSchema),
});

export const SavedReviewSummaryRowSchema = z.object({
  sample_id: z.string().uuid(),
  label: z.string(),
  canonical_name: z.string().nullable(),
  store_id: z.string().nullable(),
  analysis_method: z.string(),
  entry_count: z.coerce.number().int().nonnegative(),
  created_at: z.string(),
});

export const SavedReviewSummarySchema = z.object({
  sampleId: z.string().uuid(),
  label: z.string(),
  canonicalName: z.string().nullable(),
  storeId: z.string().nullable(),
  analysisMethod: z.string(),
  entryCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});

export const SavedReviewPayloadSchema = z.object({
  sampleId: z.string().uuid(),
  label: z.string(),
  storeId: z.string().nullable(),
  canonicalName: z.string().nullable(),
  analysisMethod: z.string(),
  createdAt: z.string(),
  entries: z.array(ReviewEntrySchema),
  clusters: z.array(ReviewClusterSchema),
});

export type ReviewEntry = z.infer<typeof ReviewEntrySchema>;
export type ReviewCluster = z.infer<typeof ReviewClusterSchema>;
export type ReviewSampleAnalysis = z.infer<typeof ReviewSampleAnalysisSchema>;
export type SavedReviewSummary = z.infer<typeof SavedReviewSummarySchema>;
export type SavedReviewPayload = z.infer<typeof SavedReviewPayloadSchema>;

const clusterDefinitions: Array<{
  key: ReviewClusterKey;
  label: string;
  patterns: RegExp[];
}> = [
  {
    key: 'positive',
    label: 'Positive',
    patterns: [/\blove\b/i, /\bfun\b/i, /\bgreat\b/i, /\bamazing\b/i, /\bexcellent\b/i, /\benjoy(?:ed|ing)?\b/i, /\baddict(?:ive|ing)\b/i, /\bbest\b/i],
  },
  {
    key: 'negative',
    label: 'Negative',
    patterns: [/\bhate\b/i, /\bawful\b/i, /\bterrible\b/i, /\bworst\b/i, /\bboring\b/i, /\bannoy(?:ing|ed)\b/i, /\bfrustrat(?:ing|ed)\b/i, /\bdisappoint(?:ing|ed)\b/i],
  },
  {
    key: 'ads',
    label: 'Ads',
    patterns: [/\bads?\b/i, /advertis/i, /commercial/i, /forced video/i, /rewarded video/i],
  },
  {
    key: 'difficulty',
    label: 'Difficulty',
    patterns: [/\btoo hard\b/i, /\btoo easy\b/i, /\bdifficult\b/i, /\bimpossible\b/i, /\bchalleng(?:e|ing)\b/i, /\bstuck\b/i, /difficulty/i],
  },
  {
    key: 'monetization',
    label: 'Monetization',
    patterns: [/in[- ]app/i, /purchase/i, /\bpay(?:wall|ing)?\b/i, /\bprice\b/i, /\bexpensive\b/i, /subscription/i, /\bmoney\b/i, /\bcoins?\b/i, /\benergy\b/i],
  },
  {
    key: 'repetition',
    label: 'Repetition',
    patterns: [/repetit/i, /\brepeat(?:ing|ed)?\b/i, /same thing/i, /over and over/i, /gets boring/i, /same level/i],
  },
  {
    key: 'bugs',
    label: 'Bugs / performance',
    patterns: [/\bbug(?:s|gy)?\b/i, /\bcrash(?:es|ed|ing)?\b/i, /\bfreeze(?:s|ing)?\b/i, /\blag(?:gy|ging)?\b/i, /\bglitch/i, /not load/i, /won't load/i, /broken/i],
  },
  {
    key: 'requests',
    label: 'Feature requests',
    patterns: [/\bplease add\b/i, /\badd (?:a|an|more|the)\b/i, /\bi wish\b/i, /\bwould love\b/i, /\bneeds? (?:a|an|more|the)\b/i, /\bfeature request\b/i],
  },
  {
    key: 'quit_reasons',
    label: 'Quit / uninstall reasons',
    patterns: [/\buninstall/i, /\bdeleted? (?:it|the app|this)\b/i, /\bquit(?:ting)?\b/i, /stopped playing/i, /gave up/i, /won't play/i, /never playing/i],
  },
];

function parseLine(raw: string, sequence: number): ReviewEntry | null {
  const value = raw.trim();
  if (!value) return null;

  const rated = value.match(/^\s*(?:\[?([1-5])(?:\s*stars?)?\]?\s*(?:\||:|-|\t))\s*(.+)$/i);
  const rating = rated ? Number(rated[1]) : null;
  const text = (rated?.[2] ?? value).trim();
  if (!text) return null;

  const labels = clusterDefinitions
    .filter((definition) => definition.patterns.some((pattern) => pattern.test(text)))
    .map((definition) => definition.key);

  if (rating != null && rating >= 4 && !labels.includes('positive')) labels.push('positive');
  if (rating != null && rating <= 2 && !labels.includes('negative')) labels.push('negative');

  return ReviewEntrySchema.parse({ sequence, rating, text, labels });
}

export function analyzeReviewSample(rawText: string): ReviewSampleAnalysis {
  const rawLines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const entries = rawLines
    .slice(0, 500)
    .map((line, index) => parseLine(line, index + 1))
    .filter((entry): entry is ReviewEntry => entry !== null);

  if (entries.length === 0) throw new Error('Paste at least one non-empty review, one review per line.');

  const clusters: ReviewCluster[] = clusterDefinitions.map((definition) => {
    const evidenceSequences = entries
      .filter((entry) => entry.labels.includes(definition.key))
      .map((entry) => entry.sequence);
    return {
      clusterKey: definition.key,
      label: definition.label,
      reviewCount: evidenceSequences.length,
      sampleShare: evidenceSequences.length / entries.length,
      evidenceSequences,
    };
  });

  return ReviewSampleAnalysisSchema.parse({
    analysisMethod: 'keyword_rules_v1',
    entries,
    clusters,
  });
}
