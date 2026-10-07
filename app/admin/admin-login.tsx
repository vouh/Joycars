'use client';
import { useState, type FormEvent } from 'react';

export default function AdminLogin({ linkFailed }: { linkFailed: boolean }) {
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(linkFailed ? 'That sign-in link is invalid or has expired. Please sign in again.' : '');
  const [notice, setNotice] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    setBusy(true);
    setError('');
    setNotice('');
    const res = await fetch(mode === 'password' ? '/api/auth/password-sign-in' : '/api/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'password' ? { email, password: String(form.get('password') ?? '') } : { email }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) { setError(body?.error?.message ?? 'Sign-in failed. Please try again.'); return; }
    if (mode === 'password') window.location.replace('/admin');
    else setNotice(body?.message ?? 'Check your email for a sign-in link.');
  }

  return <div className="admin-card admin-narrow">
    <h1>Staff sign in</h1>
    <p>Sign in to see bookings and enquiries from the website.</p>
    <form className="enquiry-form" onSubmit={submit}>
      <label htmlFor="admin-email">Email<input id="admin-email" name="email" type="email" required autoComplete="username" maxLength={254} /></label>
      {mode === 'password' && <label htmlFor="admin-password">Password<input id="admin-password" name="password" type="password" required autoComplete="current-password" maxLength={200} /></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <button className="button" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'password' ? 'Sign in' : 'Email me a sign-in link'}</button>
    </form>
    <button className="text-link admin-switch" onClick={() => { setMode(mode === 'password' ? 'link' : 'password'); setError(''); setNotice(''); }}>
      {mode === 'password' ? 'Forgot your password? Email me a sign-in link instead' : 'Sign in with a password instead'}
    </button>
  </div>;
}
