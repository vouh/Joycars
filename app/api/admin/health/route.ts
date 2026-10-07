import { requireStaff } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { getBusinessSystemAdapter } from '@/lib/integrations/business-system';
import { deliveryHealth } from '@/lib/services/lead-delivery';

/** Lead delivery status for the staff dashboard: surfaces stuck or failed deliveries. */
export const GET = route(async () => {
  await requireStaff();
  return json({ deliveryEnabled: Boolean(getBusinessSystemAdapter()), ...(await deliveryHealth()) });
});
