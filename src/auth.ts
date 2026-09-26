import type { User } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from './lib/supabase';

function requireSupabase() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase is not configured.');
  }
  return supabase;
}

export async function getOwnerUser(): Promise<User | null> {
  if (!hasSupabaseConfig || !supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export function subscribeOwnerAuth(onChange: (user: User | null) => void) {
  if (!hasSupabaseConfig || !supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function requestOwnerMagicLink(email: string) {
  const client = requireSupabase();
  const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });
  if (error) throw error;
}

export async function signOutOwner() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
