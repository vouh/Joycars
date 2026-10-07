import { requireStaff } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const GET = route(async () => {
  const staff = await requireStaff();
  return json({ id: staff.id, email: staff.email, role: staff.role });
});
