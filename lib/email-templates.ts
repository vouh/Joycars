import { formatNairobi } from './time';

export type EmailMessage = { to: string; subject: string; html: string; text: string };

export type ConfirmationLead = {
  id: string;
  type: 'enquiry' | 'viewing';
  name: string;
  phone: string;
  email: string;
  message: string | null;
  preferredViewingAt: Date | null;
  vehicle: { make: string; model: string; year: number | null; availability: 'available' | 'reserved' | 'sold' } | null;
};

export type Showroom = { name: string; address: string; phone: string | null; hours: string | null } | null;

const BUSINESS_NAME = 'JoyCars';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** "We received your request" email. It must never read as a confirmed booking. */
export function buildConfirmationEmail(lead: ConfirmationLead, showroom: Showroom): EmailMessage {
  const viewing = lead.type === 'viewing';
  const request = viewing ? 'viewing request' : 'enquiry';
  const vehicle = lead.vehicle ? [lead.vehicle.year, lead.vehicle.make, lead.vehicle.model].filter(Boolean).join(' ') : null;
  const reference = lead.id.slice(0, 8).toUpperCase();

  const details: [string, string][] = [
    ...(vehicle ? [['Vehicle', vehicle] as [string, string]] : []),
    ...(lead.preferredViewingAt ? [['Preferred time', `${formatNairobi(lead.preferredViewingAt)} (Nairobi time)`] as [string, string]] : []),
    ['Phone', lead.phone],
    ...(lead.message ? [['Your message', lead.message] as [string, string]] : []),
    ['Reference', reference],
  ];
  const nextSteps = viewing
    ? `This is a request, not a confirmed booking. Our team will contact you on ${lead.phone} to confirm the time.`
    : `Our team will contact you on ${lead.phone} soon.`;
  const reservedNote = viewing && lead.vehicle?.availability === 'reserved' ? 'This car is currently reserved, so we will also confirm that it is still available.' : null;
  const showroomLines = showroom ? [`${showroom.name}, ${showroom.address}`, showroom.phone, showroom.hours].filter((l): l is string => Boolean(l)) : [];

  const text = [
    `Hi ${lead.name},`,
    '',
    `Thank you for contacting ${BUSINESS_NAME}. We have received your ${request}.`,
    '',
    ...details.map(([label, value]) => `${label}: ${value}`),
    '',
    nextSteps,
    ...(reservedNote ? [reservedNote] : []),
    ...(showroomLines.length ? ['', 'Where to find us:', ...showroomLines] : []),
    '',
    'If you did not make this request, you can ignore this email.',
    '',
    `${BUSINESS_NAME}`,
  ].join('\n');

  const p = 'margin:0 0 16px;font-size:15px;line-height:1.6;color:#171b1d';
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px">
<p style="margin:0 0 20px;font-size:24px;font-weight:700;color:#171b1d">Joy<span style="color:#ff9800">Cars</span></p>
<p style="${p}">Hi ${escapeHtml(lead.name)},</p>
<p style="${p}">Thank you for contacting ${BUSINESS_NAME}. We have received your ${request}.</p>
<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px">
${details.map(([label, value]) => `<tr><td style="padding:8px 12px 8px 0;color:#777;vertical-align:top;white-space:nowrap">${label}</td><td style="padding:8px 0;color:#171b1d;white-space:pre-line">${escapeHtml(value)}</td></tr>`).join('\n')}
</table>
<p style="${p};background:#fff7ea;padding:14px;border-radius:8px">${escapeHtml(nextSteps)}${reservedNote ? `<br>${escapeHtml(reservedNote)}` : ''}</p>
${showroomLines.length ? `<p style="${p}"><strong>Where to find us</strong><br>${showroomLines.map(escapeHtml).join('<br>')}</p>` : ''}
<p style="margin:0;font-size:12px;color:#888">If you did not make this request, you can ignore this email.</p>
</div></body></html>`;

  return { to: lead.email, subject: `We have received your ${request} – ${BUSINESS_NAME}`, html, text };
}
