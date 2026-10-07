'use client';
import { useState, type FormEvent } from 'react';
export default function ViewingFee({ initialFee }: { initialFee: number }) {
  const [fee, setFee] = useState(initialFee), [message, setMessage] = useState(''), [saving, setSaving] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      const r = await fetch('/api/admin/booking-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feeKes: fee }) });
      const body = await r.json();
      setMessage(r.ok ? 'Viewing fee saved. Applies to new payments.' : body.error?.message || 'Could not save.');
    } catch { setMessage('Could not reach the server.'); } finally { setSaving(false); }
  }
  return <form className="admin-card fee-setting" onSubmit={save}><div><h3>Viewing fee</h3><p>New customers pay this amount via M-Pesa. Existing payment amounts stay unchanged.</p></div><label>Amount (KES)<input type="number" min="1" max="150000" step="1" required value={fee} onChange={e => setFee(Number(e.target.value))}/></label><button className="button" disabled={saving}>{saving ? 'Saving…' : 'Save fee'}</button><p role="status">{message}</p></form>;
}
