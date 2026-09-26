import { PolicyReviewSchema, type PolicyAffectedDimension, type PolicyReview, type PolicyReviewState, type PolicySeverity } from './policy';
import { hasSupabaseConfig, supabase } from './lib/supabase';

function requireSupabase() {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

async function requireOwner() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Owner sign-in is required for policy review actions.');
  return { client, user: data.user };
}

function mapRow(row: Record<string, unknown>): PolicyReview {
  return PolicyReviewSchema.parse({
    id: row.id,
    changeId: row.change_id,
    sourceId: row.source_id,
    state: row.state,
    severity: row.severity ?? null,
    affectedDimensions: row.affected_dimensions ?? [],
    notes: row.notes ?? '',
    reviewedAt: row.reviewed_at ?? null,
    updatedAt: row.updated_at ?? null,
  });
}

export async function listPolicyReviews(): Promise<PolicyReview[]> {
  if (!hasSupabaseConfig || !supabase) return [];
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from('policy_change_reviews')
    .select('id, change_id, source_id, state, severity, affected_dimensions, notes, reviewed_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function savePolicyReview(input: {
  changeId: string;
  sourceId: string;
  state: PolicyReviewState;
  severity: PolicySeverity | null;
  affectedDimensions: PolicyAffectedDimension[];
  notes: string;
}): Promise<PolicyReview> {
  const { client, user } = await requireOwner();
  if (input.state !== 'new_change' && ['relevant', 'not_relevant', 'closed', 'needs_follow_up'].includes(input.state) && !input.severity) {
    throw new Error('Choose a severity before completing this policy review state.');
  }

  const payload = {
    owner_id: user.id,
    change_id: input.changeId,
    source_id: input.sourceId,
    state: input.state,
    severity: input.severity,
    affected_dimensions: input.affectedDimensions,
    notes: input.notes.trim(),
  };

  const { data, error } = await client
    .from('policy_change_reviews')
    .upsert(payload, { onConflict: 'owner_id,change_id' })
    .select('id, change_id, source_id, state, severity, affected_dimensions, notes, reviewed_at, updated_at')
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}
