import { requireStaff } from '@/lib/auth';
import { json, parseQuery, route } from '@/lib/http';
import { exportLeadsCsv, listLeads } from '@/lib/services/admin-leads';
import { adminLeadListSchema } from '@/lib/validation/lead';

/** Captured-enquiry inbox. `?format=csv` downloads an export (audited). */
export const GET = route(async req => {
  const staff = await requireStaff();
  const query = parseQuery(req, adminLeadListSchema);
  if (query.format === 'csv') {
    const csv = await exportLeadsCsv(staff, query);
    const stamp = new Date().toISOString().slice(0, 10);
    // BOM so Excel opens UTF-8 names correctly.
    return new Response(`﻿${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="joycars-enquiries-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  return json(await listLeads(query));
});
