import { z } from 'zod';

const HealthComponentSchema = z.object({
  id: z.string().min(3),
  label: z.string().min(3),
  state: z.enum(['healthy', 'degraded', 'blocked', 'maturing', 'optional']),
  facts: z.array(z.string()).min(1),
  action: z.string().nullable(),
});

const RecommendedActionSchema = z.object({
  priority: z.number().int().nonnegative(),
  action: z.string().min(5),
  why: z.string().min(12),
  appId: z.string().optional(),
  name: z.string().optional(),
});

export const DataHealthSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  overall: z.enum(['ready', 'ready_with_maturing_history', 'degraded', 'blocked']),
  statement: z.string(),
  essentialHealthy: z.number().int().nonnegative(),
  essentialCount: z.number().int().positive(),
  components: z.array(HealthComponentSchema).min(7),
  recommendedActions: z.array(RecommendedActionSchema),
  facts: z.object({
    radarDate: z.string().nullable(),
    researchQueueDate: z.string().nullable(),
    exactHistoryDays: z.number().int().nonnegative(),
    trendSignalCount: z.number().int().nonnegative().optional(),
    trendExpectedSignalCount: z.number().int().nonnegative().optional(),
    trendHealthyMarketCount: z.number().int().nonnegative().optional(),
    trendExpectedMarketCount: z.number().int().nonnegative().optional(),
    trendDerivedFromCurrentRadar: z.boolean().optional(),
    trendChartDepthMatches: z.boolean().optional(),
    trendStateCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
    verificationTaskCount: z.number().int().nonnegative(),
    verificationRawTaskCount: z.number().int().nonnegative(),
    verificationOmittedTaskCount: z.number().int().nonnegative(),
    verificationCaptureSessionCount: z.number().int().nonnegative().optional(),
    verificationGroupedEvidenceTaskCount: z.number().int().nonnegative().optional(),
    verificationDerivedFromCurrentQueue: z.boolean(),
    gameplayDiscoveryConfigured: z.boolean().optional(),
    gameplayDiscoveryProvider: z.enum(['tavily', 'gemini_google_search', 'none']).optional(),
    gameplayDiscoveryCandidateCount: z.number().int().nonnegative().optional(),
    gameplayDiscoveryRequestsUsed: z.number().int().nonnegative().optional(),
    gameplayDiscoverySearchQueriesUsed: z.number().int().nonnegative().optional(),
    gameplayDiscoveryDerivedFromCurrentVerification: z.boolean().optional(),
    policyDetectedChangeCount: z.number().int().nonnegative(),
    confirmedPolicyChanges: z.number().int().nonnegative().optional(),
    pendingPolicyCandidates: z.number().int().nonnegative().optional(),
    legacyUnconfirmedPolicyChanges: z.number().int().nonnegative().optional(),
    appBrainConfigured: z.boolean(),
  }),
});

export type DataHealth = z.infer<typeof DataHealthSchema>;

export function normalizeDataHealthAction(action: string) {
  return action.trim().toUpperCase();
}

export function isDeepVerifyTopCandidateAction(action: string) {
  return normalizeDataHealthAction(action) === 'DEEP_VERIFY_TOP_CANDIDATE';
}

export async function loadDataHealth(): Promise<DataHealth> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/health/latest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Data health request failed (${response.status}).`);
  return DataHealthSchema.parse(await response.json());
}
