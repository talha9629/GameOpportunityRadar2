import { z } from 'zod';
import type { DeepVerifyEvent } from './deepVerify';

export const VerificationResolutionCategorySchema = z.enum([
  'gameplay_mechanic',
  'monetization_placement',
  'meta_progression',
  'other_unknown',
]);

export const VerificationResolutionStateSchema = z.enum(['resolved', 'needs_more_evidence']);

export const VerificationTaskResolutionRowSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  task_id: z.string().regex(/^[a-f0-9]{24}$/),
  session_id: z.string().regex(/^[a-f0-9]{24}$/),
  source_video_id: z.string().uuid(),
  source_event_id: z.string().uuid().nullable(),
  unknown_snapshot: z.string().trim().min(15).max(2000),
  category: VerificationResolutionCategorySchema,
  research_generated_at: z.string(),
  resolution_state: VerificationResolutionStateSchema,
  resolution_summary: z.string().trim().min(10).max(4000),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const VerificationTaskResolutionSchema = z.object({
  resolutionId: z.string().uuid(),
  taskId: z.string().regex(/^[a-f0-9]{24}$/),
  sessionId: z.string().regex(/^[a-f0-9]{24}$/),
  sourceVideoId: z.string().uuid(),
  sourceEventId: z.string().uuid().nullable(),
  unknownSnapshot: z.string().trim().min(15).max(2000),
  category: VerificationResolutionCategorySchema,
  researchGeneratedAt: z.string(),
  state: VerificationResolutionStateSchema,
  summary: z.string().trim().min(10).max(4000),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).superRefine((value, context) => {
  if (value.state === 'resolved' && (!value.sourceEventId || !value.resolvedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['state'], message: 'Resolved tasks require a cited confirmed event and resolution timestamp.' });
  }
  if (value.state === 'needs_more_evidence' && (value.sourceEventId || value.resolvedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['state'], message: 'Open tasks cannot retain resolved evidence fields.' });
  }
});

export type VerificationResolutionCategory = z.infer<typeof VerificationResolutionCategorySchema>;
export type VerificationResolutionState = z.infer<typeof VerificationResolutionStateSchema>;
export type VerificationTaskResolution = z.infer<typeof VerificationTaskResolutionSchema>;

export function eventKeyForResolutionCategory(category: VerificationResolutionCategory) {
  if (category === 'gameplay_mechanic') return 'mechanic';
  if (category === 'monetization_placement') return 'monetization';
  if (category === 'meta_progression') return 'progression';
  return 'other';
}

export function confirmedEventsForResolution(
  category: VerificationResolutionCategory,
  events: DeepVerifyEvent[],
) {
  const eventKey = eventKeyForResolutionCategory(category);
  return events.filter((event) => event.reviewState === 'human_confirmed' && event.eventKey === eventKey);
}

export function resolutionForTask(resolutions: VerificationTaskResolution[], taskId: string) {
  return resolutions.find((resolution) => resolution.taskId === taskId) ?? null;
}

export function resolvedTaskCount(resolutions: VerificationTaskResolution[], taskIds: string[]) {
  const ids = new Set(taskIds);
  return resolutions.filter((resolution) => ids.has(resolution.taskId) && resolution.state === 'resolved').length;
}
