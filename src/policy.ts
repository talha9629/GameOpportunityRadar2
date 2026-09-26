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

export const PolicySnapshotRefSchema = z.object({
  hash: HashSchema,
  path: z.string().min(1),
  fetchedAt: z.string().datetime(),
});

export const PolicyChangeSchema = z.object({
  id: HashSchema,
  fromHash: HashSchema,
  toHash: HashSchema,
  detectedAt: z.string().datetime(),
  fromPath: z.string().min(1),
  toPath: z.string().min(1),
});
export type PolicyChange = z.infer<typeof PolicyChangeSchema>;

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
  current: PolicySnapshotRefSchema.nullable(),
  history: z.array(PolicySnapshotRefSchema),
  changes: z.array(PolicyChangeSchema),
});
export type PolicySource = z.infer<typeof PolicySourceSchema>;

export const PolicyIndexSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  runStatus: z.enum(['complete', 'partial', 'failed']),
  sourceCount: z.number().int().nonnegative(),
  freshCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  sources: z.array(PolicySourceSchema),
});
export type PolicyIndex = z.infer<typeof PolicyIndexSchema>;

export const PolicySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
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
    .flatMap((source) => source.changes.map((change) => ({ source, change })))
    .sort((a, b) => b.change.detectedAt.localeCompare(a.change.detectedAt));
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
