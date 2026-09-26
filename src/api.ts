import { AnalysisResultSchema, GameInputSchema, type AnalysisResult, type ReviewState } from './domain';
import { hasSupabaseConfig, supabase } from './lib/supabase';

export async function analyzeGame(input: string): Promise<AnalysisResult> {
  const parsedInput = GameInputSchema.parse(input);

  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase is not configured yet. Connect the deployment to the Radar Supabase project first.');
  }

  const { data, error } = await supabase.functions.invoke('analyze-game', {
    body: { input: parsedInput },
  });

  if (error) throw error;
  return AnalysisResultSchema.parse(data);
}

export async function setFindingReviewState(findingId: string, reviewState: ReviewState) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('findings')
    .update({ review_state: reviewState, reviewed_at: new Date().toISOString() })
    .eq('id', findingId);

  if (error) throw error;
}
