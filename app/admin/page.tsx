import type { Metadata } from 'next';
import ViewingFee from './viewing-fee';
import { getViewingFee } from '@/lib/services/booking-settings';
import type { ReactNode } from 'react';
import { getStaff } from '@/lib/auth';
import { emailEnabled } from '@/lib/email';
import { env } from '@/lib/env';
import type { StaffProfile } from '@/lib/generated/prisma/client';
import { leadStats, listLeads } from '@/lib/services/admin-leads';
import { CONFIRMATION_RETRY_WINDOW_MS, MAX_CONFIRMATION_ATTEMPTS } from '@/lib/services/lead-emails';
import { formatNairobi } from '@/lib/time';
import { adminLeadListSchema } from '@/lib/validation/lead';
import AdminLogin from './admin-login';
import SignOutButton from './sign-out-button';

export const metadata: Metadata = { title: 'Admin | JoyCars', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const VIEWS = {
  viewing: { label: 'Viewing requests', query: { type: 'viewing' } },
  upcoming: { label: 'Upcoming viewings', query: { upcoming: 'true' } },
  enquiry: { label: 'Enquiries', query: { type: 'enquiry' } },
  all: { label: 'Everything', query: {} },
} as const;
type View = keyof typeof VIEWS;
type Lead = Awaited<ReturnType<typeof listLeads>>['items'][number];
type Tone = 'ok' | 'warn' | 'bad' | 'muted';

function Shell({ staff, children }: { staff?: StaffProfile; children: ReactNode }) {
  return <main className="admin-shell">
    <div className="admin-top">
      <a className="admin-brand" href="/">Joy<span>Cars</span> <small>Admin</small></a>
      {staff && <div className="admin-user"><span>{staff.email}</span><SignOutButton /></div>}
    </div>
    {children}
  </main>;
}

function confirmationStatus(lead: Lead, mailOn: boolean): { label: string; tone: Tone; detail?: string } {
  if (!lead.email) return { label: 'No email given', tone: 'muted' };
  if (lead.confirmationSentAt) return { label: 'Sent', tone: 'ok', detail: formatNairobi(lead.confirmationSentAt) };
  const expired = Date.now() - lead.createdAt.getTime() > CONFIRMATION_RETRY_WINDOW_MS;
  if (lead.confirmationAttempts >= MAX_CONFIRMATION_ATTEMPTS || (expired && lead.confirmationAttempts > 0)) return { label: 'Not sent', tone: 'bad', detail: lead.confirmationError ?? undefined };
  if (!mailOn) return { label: 'Email not set up', tone: 'muted' };
  if (expired) return { label: 'Not sent', tone: 'bad' };
  return lead.confirmationError ? { label: 'Retrying', tone: 'warn', detail: lead.confirmationError } : { label: 'Sending', tone: 'warn' };
}

const PAYMENT: Record<string, { label: string; tone: Tone }> = {
  paid: { label: 'Paid', tone: 'ok' },
  pending: { label: 'Awaiting payment', tone: 'warn' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
  expired: { label: 'Not completed', tone: 'bad' },
  failed: { label: 'Failed', tone: 'bad' },
};

/** Latest M-Pesa viewing fee for the booking (a paid one wins). */
function paymentStatus(lead: Lead): { label: string; tone: Tone; detail?: string } {
  if (lead.type !== 'viewing') return { label: 'No fee', tone: 'muted' };
  const p = lead.payments.find(x => x.status === 'paid') ?? lead.payments[0];
  if (!p) return { label: 'Not started', tone: 'muted' };
  const base = PAYMENT[p.status];
  if (p.status === 'paid') return { ...base, label: `Paid KES ${p.amountKes.toLocaleString('en-KE')}`, detail: p.mpesaReceipt ?? undefined };
  return { ...base, detail: p.resultDesc ?? undefined };
}

const DELIVERY: Record<string, { label: string; tone: Tone }> = {
  delivered: { label: 'Delivered', tone: 'ok' },
  pending: { label: 'Pending', tone: 'muted' },
  failed: { label: 'Failed', tone: 'bad' },
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (key: string) => { const value = params[key]; return Array.isArray(value) ? value[0] : value; };

  let staff: StaffProfile | null;
  try {
    staff = await getStaff();
  } catch (error) {
    console.error('[admin] unavailable', error instanceof Error ? error.message : 'unknown error');
    return <Shell><div className="admin-card admin-narrow"><h1>Admin is not available</h1><p>The server could not reach the database or the sign-in service. Check the environment variables listed in the README, then reload this page.</p></div></Shell>;
  }
  if (!staff) return <Shell><AdminLogin linkFailed={one('auth_error') === '1'} signupEnabled={env().ADMIN_SIGNUP_ENABLED} /></Shell>;

  const requested = one('view');
  const view: View = requested && requested in VIEWS ? (requested as View) : 'viewing';
  const parsed = adminLeadListSchema.safeParse({ ...VIEWS[view].query, page: one('page') });
  const query = parsed.success ? parsed.data : adminLeadListSchema.parse(VIEWS[view].query);
  const [leads, stats] = await Promise.all([listLeads(query), leadStats()]);
  const mailOn = emailEnabled();
  const totalPages = Math.max(1, Math.ceil(leads.total / leads.pageSize));
  const href = (v: View, page = 1) => {
    const qs = new URLSearchParams({ ...(v !== 'viewing' && { view: v }), ...(page > 1 && { page: String(page) }) }).toString();
    return qs ? `/admin?${qs}` : '/admin';
  };
  const csvHref = `/api/admin/leads?${new URLSearchParams({ format: 'csv', ...VIEWS[view].query })}`;

  return <Shell staff={staff}>
    {staff.role === 'admin' && <ViewingFee initialFee={await getViewingFee()} />}
    <div className="admin-heading">
      <div><h1>Bookings</h1><p>Requests from the website. A viewing request is not confirmed until your team contacts the customer.</p></div>
      <a className="button" href={csvHref}>Download CSV</a>
    </div>
    {!mailOn && <p className="admin-notice">Confirmation emails are switched off. Set <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> to email customers a copy of their request.</p>}
    <div className="admin-stats">
      {[['Upcoming viewings', stats.upcomingViewings], ['New in the last 7 days', stats.newThisWeek], ['Viewing requests', stats.viewingRequests], ['Enquiries', stats.enquiries]].map(([label, value]) => <div className="admin-card admin-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
    <div className="admin-tabs" role="navigation" aria-label="Booking views">
      {(Object.keys(VIEWS) as View[]).map(v => <a key={v} href={href(v)} className={v === view ? 'active' : ''} aria-current={v === view ? 'page' : undefined}>{VIEWS[v].label}</a>)}
    </div>
    <div className="admin-card admin-table-wrap">
      {leads.items.length === 0 ? <p className="admin-empty">Nothing here yet.</p> : <table className="admin-table">
        <thead><tr><th>Received</th><th>Type</th><th>Customer</th><th>Vehicle</th><th>Preferred time</th><th>Viewing fee</th><th>Message</th><th>Confirmation email</th><th>Business system</th></tr></thead>
        <tbody>{leads.items.map(lead => {
          const email = confirmationStatus(lead, mailOn);
          const delivery = DELIVERY[lead.delivery?.state ?? 'pending'];
          const payment = paymentStatus(lead);
          return <tr key={lead.id}>
            <td>{formatNairobi(lead.createdAt)}</td>
            <td><span className={`admin-pill ${lead.type}`}>{lead.type === 'viewing' ? 'Viewing' : 'Enquiry'}</span></td>
            <td className="admin-customer"><strong>{lead.name}</strong><a href={`tel:${lead.phone}`}>{lead.phone}</a>{lead.email && <a href={`mailto:${lead.email}`}>{lead.email}</a>}</td>
            <td>{lead.vehicle ? <>{[lead.vehicle.year, lead.vehicle.make, lead.vehicle.model].filter(Boolean).join(' ')}<small className="admin-sub">{lead.vehicle.availability}</small></> : <span className="admin-sub">General</span>}</td>
            <td>{lead.preferredViewingLocal ?? <span className="admin-sub">None</span>}</td>
            <td><span className={`admin-status ${payment.tone}`}>{payment.label}</span>{payment.detail && <small className="admin-sub">{payment.detail}</small>}</td>
            <td className="admin-message">{lead.message ?? <span className="admin-sub">None</span>}</td>
            <td><span className={`admin-status ${email.tone}`}>{email.label}</span>{email.detail && <small className="admin-sub">{email.detail}</small>}</td>
            <td><span className={`admin-status ${delivery.tone}`}>{delivery.label}</span></td>
          </tr>;
        })}</tbody>
      </table>}
    </div>
    {totalPages > 1 && <div className="admin-pages">
      {leads.page > 1 ? <a href={href(view, leads.page - 1)}>Previous</a> : <span />}
      <span>Page {leads.page} of {totalPages} · {leads.total} total</span>
      {leads.page < totalPages ? <a href={href(view, leads.page + 1)}>Next</a> : <span />}
    </div>}
  </Shell>;
}
