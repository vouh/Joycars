import { NextResponse } from 'next/server';
import { json, notFound, route } from '@/lib/http';
import { getPublicVehicleBySlug } from '@/lib/services/public-inventory';
import { slugSchema } from '@/lib/validation/vehicle';

export const GET = route(async (req, { params }: { params: Promise<{ slug: string }> }) => {
  const parsed = slugSchema.safeParse((await params).slug);
  if (!parsed.success) throw notFound('Vehicle');
  const result = await getPublicVehicleBySlug(parsed.data);
  if (result.kind === 'redirect') return NextResponse.redirect(new URL(`/api/vehicles/${result.slug}`, req.url), 308);
  if (result.kind === 'not_found') throw notFound('Vehicle');
  return json({ vehicle: result.vehicle, alternatives: result.alternatives }, { cache: 'public' });
});
