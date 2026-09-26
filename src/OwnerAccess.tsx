import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { LogIn, LogOut } from 'lucide-react';
import { requestOwnerMagicLink, signOutOwner } from './auth';
import './owner-access.css';

export function OwnerAccess({ user }: { user: User | null }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendMagicLink() {
    setBusy(true);
    setMessage(null);
    try {
      await requestOwnerMagicLink(email);
      setMessage('Magic link requested. Check the owner inbox.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not request sign-in link.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setMessage(null);
    try {
      await signOutOwner();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return <div className="owner-access signed-in"><div><span>Owner</span><strong>{user.email ?? 'Authenticated'}</strong></div><button onClick={signOut} disabled={busy}><LogOut size={15} /> Sign out</button>{message && <small>{message}</small>}</div>;
  }

  return <div className="owner-access"><div className="owner-signin-row"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Owner email" autoComplete="email" /><button onClick={sendMagicLink} disabled={busy || !email.includes('@')}><LogIn size={15} /> {busy ? 'Sending…' : 'Sign in to save'}</button></div>{message && <small>{message}</small>}<small className="owner-note">Existing owner accounts only. This form never creates a new user.</small></div>;
}
