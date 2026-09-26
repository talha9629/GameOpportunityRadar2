import {
  AnalysisResultSchema,
  CandidateSearchResultSchema,
  GameInputSchema,
  type AnalysisResult,
  type CandidateSearchResult,
} from './domain';
import { hasSupabaseConfig, supabase } from './lib/supabase';

function requireSupabase() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase is not configured yet. Connect the deployment to the Radar Supabase project first.');
  }
  return supabase;
}

export function isDirectAppleInput(input: string) {
  const value = input.trim();
  return /^\d{5,}$/.test(value) || /apps\.apple\.com\/.*\/id\d{5,}/i.test(value);
}

export async function searchGameCandidates(input: string): Promise<CandidateSearchResult> {
  const parsedInput = GameInputSchema.parse(input);
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('analyze-game', {
    body: { input: parsedInput, mode: 'search' },
  });
  if (error) throw error;
  return CandidateSearchResultSchema.parse(data);
}

export async function analyzeGame(input: string): Promise<AnalysisResult> {
  const parsedInput = GameInputSchema.parse(input);
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('analyze-game', {
    body: { input: parsedInput, mode: 'analyze' },
  });

  if (error) throw error;
  return AnalysisResultSchema.parse(data);
}
