'use client';
import { useState } from 'react';

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/sign-out', { method: 'POST' }).catch(() => null);
    window.location.replace('/admin');
  }
  return <button className="admin-signout" onClick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>;
}
