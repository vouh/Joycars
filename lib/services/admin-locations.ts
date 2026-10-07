import 'server-only';
import type { z } from 'zod';
import { recordAudit } from '@/lib/audit';
import { invalidateLocations } from '@/lib/cache';
import { db } from '@/lib/db';
import type { StaffProfile } from '@/lib/generated/prisma/client';
import { ApiError, notFound } from '@/lib/http';
import type { locationCreateSchema, locationUpdateSchema } from '@/lib/validation/admin';

export async function listLocations() {
  return db.location.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { vehicles: true } } } });
}

export async function createLocation(staff: StaffProfile, input: z.infer<typeof locationCreateSchema>) {
  const location = await db.$transaction(async tx => {
    const row = await tx.location.create({ data: input });
    await recordAudit(tx, { actorId: staff.id, action: 'location.created', entityType: 'location', entityId: row.id, changes: { name: row.name } });
    return row;
  });
  invalidateLocations();
  return location;
}

export async function updateLocation(staff: StaffProfile, id: string, input: z.infer<typeof locationUpdateSchema>) {
  const location = await db.$transaction(async tx => {
    if (!(await tx.location.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Location');
    const row = await tx.location.update({ where: { id }, data: input });
    await recordAudit(tx, { actorId: staff.id, action: 'location.updated', entityType: 'location', entityId: id, changes: { fields: Object.keys(input) } });
    return row;
  });
  invalidateLocations();
  return location;
}

export async function deleteLocation(staff: StaffProfile, id: string) {
  await db.$transaction(async tx => {
    const location = await tx.location.findUnique({ where: { id }, include: { _count: { select: { vehicles: true } } } });
    if (!location) throw notFound('Location');
    if (location._count.vehicles > 0) throw new ApiError(409, 'location_in_use', 'Move or archive the vehicles at this location first.');
    await tx.location.delete({ where: { id } });
    await recordAudit(tx, { actorId: staff.id, action: 'location.deleted', entityType: 'location', entityId: id, changes: { name: location.name } });
  });
  invalidateLocations();
}
