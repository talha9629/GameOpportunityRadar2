import { z } from 'zod';

export const PolicyReviewStateSchema = z.enum([
  'new_change', 'reviewing', 'relevant', 'not_relevant', 'closed', 'needs_follow_up',
]);
export type PolicyReviewState = z.infer<typeof PolicyReviewStateSchema>;

export const PolicySeveritySchema = z.enum(['informational', 'possible_impact', 'material']);
export type PolicySeverity = z.infer<typeof PolicySeveritySchema>;

export const PolicyAffectedDimensionSchema = z.enum([
  'solo_fit', 'differentiation', 'risk', 'monetization', 'ads', 'privacy',
  'age_rating', 'store_listing', 'content', 'social', 'data', 'publishing',
]);
export type PolicyAffectedDimension = z.infer<typeof PolicyAffectedDimensionSchema>;

export const POLICY_DIMENSIONS: Array<{ key: PolicyAffectedDimension; label: string }> = [
  { key: 'solo_fit', label: 'Solo Fit' },
  { key: 'differentiation', label: 'Differentiation' },
  { key: 'risk', label: 'Risk' },
  { key: 'monetization', label: 'Monetization' },
  { key: 'ads', label: 'Ads' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'age_rating', label: 'Age rating' },
  { key: 'store_listing', label: 'Store listing' },
  { key: 'content', label: 'Content' },
  { key: 'social', label: 'Social' },
  { key: 'data', label: 'Data' },
  { key: 'publishing', label: 'Publishing' },
];

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const NormalizationVersionSchema = z.number().int().positive().optional();

export const PolicySnapshotRefSchema = z.object({
  hash: HashSchema,
  path: z.string().min(1),
  fetchedAt: z.string().datetime(),
  normalizationVersion: NormalizationVersionSchema,
});

export const PolicyChangeSchema = z.object({
  id: HashSchema,
  fromHash: HashSchema,
  toHash: HashSchema,
  detectedAt: z.string().datetime(),
  confirmedAt: z.string().datetime().optional(),
  observations: z.number().int().positive().optional(),
  observationTimestamps: z.array(z.string().datetime()).optional(),
  confirmationStatus: z.enum(['legacy_unconfirmed', 'confirmed_repeat']).optional(),
  confirmationVersion: z.number().int().positive().optional(),
  consecutiveSuccessfulObservations: z.boolean().optional(),
  normalizationVersion: NormalizationVersionSchema,
  fromPath: z.string().min(1),
  toPath: z.string().min(1),
});
export type PolicyChange = z.infer<typeof PolicyChangeSchema>;

export const PolicyPendingCandidateSchema = z.object({
  hash: HashSchema,
  path: z.string().min(1),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  observations: z.number().int().positive(),
  observationTimestamps: z.array(z.string().datetime()).optional(),
  confirmationVersion: z.number().int().positive().optional(),
  normalizationVersion: NormalizationVersionSchema,
  minimumConfirmationAt: z.string().datetime(),
});

export const PolicyCandidateInterruptionSchema = z.object({
  id: HashSchema,
  hash: HashSchema,
  path: z.string().min(1),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  interruptedAt: z.string().datetime(),
  observations: z.number().int().positive(),
  reason: z.enum(['fetch_failure', 'different_successful_hash', 'baseline_reappeared', 'normalizer_upgrade']),
  confirmationVersion: z.number().int().positive().optional(),
});

export const PolicySourceSchema = z.object({
  id: z.string().min(3),
  vendor: z.enum(['apple', 'google']),
  title: z.string().min(1),
  category: z.string().min(1),
  critical: z.boolean(),
  url: z.string().url(),
  fetchStatus: z.enum(['fresh', 'stale', 'unavailable']),
  lastAttemptAt: z.string().datetime(),
  error: z.string().nullable(),
  normalizationVersion: NormalizationVersionSchema,
  current: PolicySnapshotRefSchema.nullable(),
  pendingCandidate: PolicyPendingCandidateSchema.nullable().optional(),
  history: z.array(PolicySnapshotRefSchema),
  changes: z.array(PolicyChangeSchema),
  candidateInterruptions: z.array(PolicyCandidateInterruptionSchema).optional(),
  normalizationRebaselines: z.array(z.object({
    id: HashSchema,
    at: z.string().datetime(),
    fromHash: HashSchema,
    toHash: HashSchema,
    fromPath: z.string().min(1).optional(),
    toPath: z.string().min(1).optional(),
    fromNormalizationVersion: z.number().int().positive(),
    toNormalizationVersion: z.number().int().positive(),
    contentHashChanged: z.boolean().optional(),
    reason: z.literal('normalizer_upgrade'),
  })).optional(),
});
export type PolicySource = z.infer<typeof PolicySourceSchema>;

export const PolicyIndexSchema = z.object({
  schemaVersion: z.literal(1),
  normalizationVersion: z.number().int().positive().optional(),
  confirmationVersion: z.number().int().positive().optional(),
  generatedAt: z.string().datetime(),
  runStatus: z.enum(['complete', 'partial', 'failed']),
  sourceCount: z.number().int().nonnegative(),
  freshCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  confirmationPolicy: z.object({
    observationsRequired: z.number().int().min(2),
    consecutiveSuccessfulObservationsRequired: z.boolean().optional(),
    fetchFailureBreaksContinuity: z.boolean().optional(),
    minimumElapsedMinutes: z.number().min(60),
    statement: z.string().min(20),
  }).optional(),
  sources: z.array(PolicySourceSchema),
});
export type PolicyIndex = z.infer<typeof PolicyIndexSchema>;

export const PolicySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  normalizationVersion: z.number().int().positive().optional(),
  sourceId: z.string().min(3),
  title: z.string().min(1),
  url: z.string().url(),
  fetchedAt: z.string().datetime(),
  hash: HashSchema,
  normalizedText: z.string().min(1),
});
export type PolicySnapshot = z.infer<typeof PolicySnapshotSchema>;

export const PolicyReviewSchema = z.object({
  id: z.string().uuid().optional(),
  changeId: HashSchema,
  sourceId: z.string().min(3),
  state: PolicyReviewStateSchema,
  severity: PolicySeveritySchema.nullable(),
  affectedDimensions: z.array(PolicyAffectedDimensionSchema),
  notes: z.string().max(4000),
  reviewedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
});
export type PolicyReview = z.infer<typeof PolicyReviewSchema>;

export type PolicyDiff = {
  removed: string[];
  added: string[];
  commonPrefixLines: number;
  commonSuffixLines: number;
};

export function buildPolicyDiff(before: string, after: string): PolicyDiff {
  const left = before.split('\n');
  const right = after.split('\n');
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < left.length - prefix
    && suffix < right.length - prefix
    && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) suffix += 1;

  return {
    removed: left.slice(prefix, left.length - suffix),
    added: right.slice(prefix, right.length - suffix),
    commonPrefixLines: prefix,
    commonSuffixLines: suffix,
  };
}

export function flattenPolicyChanges(index: PolicyIndex) {
  return index.sources
    .flatMap((source) => source.changes
      .filter((change) => change.confirmationStatus === 'confirmed_repeat')
      .map((change) => ({ source, change })))
    .sort((a, b) => (b.change.confirmedAt ?? b.change.detectedAt).localeCompare(a.change.confirmedAt ?? a.change.detectedAt));
}

export function policyStabilityCounts(index: PolicyIndex) {
  const confirmed = index.sources.reduce((sum, source) => sum + source.changes.filter((change) => change.confirmationStatus === 'confirmed_repeat').length, 0);
  const legacyUnconfirmed = index.sources.reduce((sum, source) => sum + source.changes.filter((change) => change.confirmationStatus !== 'confirmed_repeat').length, 0);
  const pending = index.sources.filter((source) => Boolean(source.pendingCandidate)).length;
  return { confirmed, legacyUnconfirmed, pending };
}

export async function loadPolicyIndex(): Promise<PolicyIndex> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/policy/index.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Policy evidence index could not be loaded (${response.status}).`);
  return PolicyIndexSchema.parse(await response.json());
}

export async function loadPolicySnapshot(snapshotPath: string): Promise<PolicySnapshot> {
  if (!snapshotPath.startsWith('data/policy/snapshots/')) throw new Error('Unsafe policy snapshot path.');
  const response = await fetch(`${import.meta.env.BASE_URL}${snapshotPath}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Policy snapshot could not be loaded (${response.status}).`);
  return PolicySnapshotSchema.parse(await response.json());
}
