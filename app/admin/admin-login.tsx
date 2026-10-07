'use client';
import { useState, type FormEvent } from 'react';

type Mode = 'password' | 'link' | 'signup';

const ENDPOINT: Record<Mode, string> = { password: '/api/auth/password-sign-in', link: '/api/auth/sign-in', signup: '/api/auth/sign-up' };

export default function AdminLogin({ linkFailed, signupEnabled }: { linkFailed: boolean; signupEnabled: boolean }) {
  const [mode, setMode] = useState<Mode>('password');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(linkFailed ? 'That sign-in link is invalid or has expired. Please sign in again.' : '');
  const [notice, setNotice] = useState('');

  function switchTo(next: Mode) { setMode(next); setError(''); setNotice(''); }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (mode === 'signup' && password !== String(form.get('confirm') ?? '')) { setError('The passwords do not match.'); return; }
    setBusy(true);
    setError('');
    setNotice('');
    const res = await fetch(ENDPOINT[mode], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'link' ? { email } : { email, password }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const fieldError = body?.error?.fields && Object.values(body.error.fields as Record<string, string>)[0];
      setError(fieldError || body?.error?.message || (mode === 'signup' ? 'Could not create the account. Please try again.' : 'Sign-in failed. Please try again.'));
      return;
    }
    if (mode === 'link') { setNotice(body?.message ?? 'Check your email for a sign-in link.'); return; }
    if (mode === 'signup' && !body?.signedIn) { switchTo('password'); setNotice('Account created. Sign in with your new password.'); return; }
    window.location.replace('/admin');
  }

  const signup = mode === 'signup';
  return <div className="admin-card admin-narrow">
    <h1>{signup ? 'Create admin account' : 'Staff sign in'}</h1>
    <p>{signup ? 'For testing: the new account gets full admin access.' : 'Sign in to see bookings and enquiries from the website.'}</p>
    <form className="enquiry-form" onSubmit={submit} key={mode}>
      <label htmlFor="admin-email">Email<input id="admin-email" name="email" type="email" required autoComplete="username" maxLength={254} /></label>
      {mode !== 'link' && <label htmlFor="admin-password">Password{signup && ' (at least 12 characters)'}<input id="admin-password" name="password" type="password" required autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 12 : undefined} maxLength={200} /></label>}
      {signup && <label htmlFor="admin-confirm">Confirm password<input id="admin-confirm" name="confirm" type="password" required autoComplete="new-password" minLength={12} maxLength={200} /></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <button className="button" type="submit" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : mode === 'password' ? 'Sign in' : 'Email me a sign-in link'}</button>
    </form>
    {mode === 'password' && <button className="text-link admin-switch" onClick={() => switchTo('link')}>Forgot your password? Email me a sign-in link instead</button>}
    {mode !== 'password' && <button className="text-link admin-switch" onClick={() => switchTo('password')}>{signup ? 'Already have an account? Sign in' : 'Sign in with a password instead'}</button>}
    {signupEnabled && !signup && <button className="text-link admin-switch" onClick={() => switchTo('signup')}>No account yet? Create an admin account</button>}
  </div>;
}
