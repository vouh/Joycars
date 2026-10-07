import 'server-only';
import type { z } from 'zod';
import { recordAudit } from '@/lib/audit';
import { invalidateInventory } from '@/lib/cache';
import { db } from '@/lib/db';
import type { Availability, Prisma, PublicationState, StaffProfile, Vehicle } from '@/lib/generated/prisma/client';
import { ApiError, notFound } from '@/lib/http';
import { vehicleSlug } from '@/lib/slug';
import type { adminVehicleListSchema, availabilityChangeSchema, publicationChangeSchema, vehicleCreateSchema, vehicleUpdateSchema } from '@/lib/validation/vehicle';
import { removeStoredImages } from './images';
import { kesToMinor, minorToKes, toPublicImage } from './vehicle-dto';

type Tx = Prisma.TransactionClient;

const adminInclude = {
  location: { select: { id: true, name: true } },
  images: { orderBy: { position: 'asc' } },
  _count: { select: { leads: true } },
} satisfies Prisma.VehicleInclude;

type AdminRow = Prisma.VehicleGetPayload<{ include: typeof adminInclude }>;

export function toAdminVehicle(v: AdminRow) {
  return {
    id: v.id,
    externalId: v.externalId,
    slug: v.slug,
    make: v.make,
    model: v.model,
    year: v.year,
    priceKes: v.priceAmount === null ? null : minorToKes(v.priceAmount),
    currency: v.currency,
    mileageKm: v.mileageKm,
    fuelType: v.fuelType,
    transmission: v.transmission,
    location: v.location,
    description: v.description,
    publicationState: v.publicationState,
    availability: v.availability,
    publishedAt: v.publishedAt,
    soldAt: v.soldAt,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    version: v.version,
    images: v.images.map(i => ({ id: i.id, position: i.position, ...toPublicImage(i), bytes: i.bytes })),
    leadCount: v._count.leads,
    publishBlockers: publishBlockers(v, v.images.length),
  };
}

/** Everything a listing needs before buyers may see it (DESIGN.md → Staff experience). */
export function publishBlockers(v: Pick<Vehicle, 'year' | 'priceAmount' | 'mileageKm' | 'fuelType' | 'transmission' | 'locationId' | 'description'>, imageCount: number) {
  const missing: string[] = [];
  if (v.year === null) missing.push('year');
  if (v.priceAmount === null) missing.push('price');
  if (v.mileageKm === null) missing.push('mileage');
  if (v.fuelType === null) missing.push('fuel type');
  if (v.transmission === null) missing.push('transmission');
  if (v.locationId === null) missing.push('location');
  if (!v.description?.trim()) missing.push('description');
  if (imageCount < 1) missing.push('at least one photo');
  return missing;
}

export async function listAdminVehicles(q: z.infer<typeof adminVehicleListSchema>) {
  const where: Prisma.VehicleWhereInput = {
    publicationState: q.publicationState,
    availability: q.availability,
    ...(q.q && {
      OR: [
        { make: { contains: q.q, mode: 'insensitive' } },
        { model: { contains: q.q, mode: 'insensitive' } },
        { slug: { contains: q.q.toLowerCase() } },
        { externalId: q.q },
      ],
    }),
  };
  const [total, rows] = await db.$transaction([
    db.vehicle.count({ where }),
    db.vehicle.findMany({ where, include: adminInclude, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  return { items: rows.map(toAdminVehicle), total, page: q.page, pageSize: q.pageSize };
}

export async function getAdminVehicle(id: string) {
  const row = await db.vehicle.findUnique({ where: { id }, include: adminInclude });
  if (!row) throw notFound('Vehicle');
  return toAdminVehicle(row);
}

type EditableInput = Partial<z.infer<typeof vehicleCreateSchema>>;

function toData(input: EditableInput) {
  const { priceKes, slug: _slug, ...rest } = input;
  return { ...rest, ...(priceKes !== undefined && { priceAmount: priceKes === null ? null : kesToMinor(priceKes) }) };
}

export async function createVehicle(staff: StaffProfile, input: z.infer<typeof vehicleCreateSchema>) {
  if (input.locationId) await assertLocation(input.locationId);
  const created = await db.$transaction(async tx => {
    const data: Prisma.VehicleUncheckedCreateInput = {
      ...toData(input),
      make: input.make,
      model: input.model,
      slug: input.slug ?? vehicleSlug(input.make, input.model, input.year),
    };
    const vehicle = await tx.vehicle.create({ data });
    await recordAudit(tx, { actorId: staff.id, action: 'vehicle.created', entityType: 'vehicle', entityId: vehicle.id, changes: { fields: Object.keys(input) } });
    return vehicle;
  });
  // Drafts aren't public, so no cache invalidation is needed yet.
  return getAdminVehicle(created.id);
}

/**
 * Applies an edit only if the caller saw the latest version (prevents lost
 * updates between two editors). Throws 409 with the current version otherwise.
 */
async function updateWithVersion(tx: Tx, id: string, version: number, data: Prisma.VehicleUncheckedUpdateManyInput) {
  const result = await tx.vehicle.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
  if (result.count === 1) return;
  const current = await tx.vehicle.findUnique({ where: { id }, select: { version: true } });
  if (!current) throw notFound('Vehicle');
  throw new ApiError(409, 'version_conflict', 'This vehicle was changed by someone else. Reload to see the latest version before saving.', { currentVersion: current.version });
}

async function loadForUpdate(tx: Tx, id: string) {
  const vehicle = await tx.vehicle.findUnique({ where: { id }, include: { _count: { select: { images: true } } } });
  if (!vehicle) throw notFound('Vehicle');
  return vehicle;
}

export async function updateVehicle(staff: StaffProfile, id: string, input: z.infer<typeof vehicleUpdateSchema>) {
  const { version, ...fields } = input;
  if (fields.locationId) await assertLocation(fields.locationId);

  const { before, after } = await db.$transaction(async tx => {
    const before = await loadForUpdate(tx, id);
    const data = toData(fields);
    const changed = Object.entries(data).filter(([k, v]) => String((before as Record<string, unknown>)[k] ?? null) !== String(v ?? null)).map(([k]) => k);
    const slugChanged = fields.slug !== undefined && fields.slug !== before.slug;

    // A published listing can't be edited into an incomplete state.
    if (before.publicationState === 'published') {
      const blockers = publishBlockers({ ...before, ...data } as Vehicle, before._count.images);
      if (blockers.length) throw new ApiError(422, 'incomplete_listing', `A published listing needs: ${blockers.join(', ')}. Unpublish it first to clear these fields.`, { missing: blockers });
    }

    await updateWithVersion(tx, id, version, { ...data, ...(slugChanged && { slug: fields.slug }) });

    // Keep old public URLs working with a permanent redirect.
    if (slugChanged && before.publishedAt) {
      await tx.vehicleSlugRedirect.upsert({ where: { slug: before.slug }, create: { slug: before.slug, vehicleId: id }, update: { vehicleId: id } });
      await tx.vehicleSlugRedirect.deleteMany({ where: { slug: fields.slug } });
    }

    await recordAudit(tx, {
      actorId: staff.id,
      action: 'vehicle.updated',
      entityType: 'vehicle',
      entityId: id,
      changes: { fields: slugChanged ? [...changed, 'slug'] : changed, ...('priceAmount' in data && changed.includes('priceAmount') && { priceKes: { from: before.priceAmount === null ? null : minorToKes(before.priceAmount), to: fields.priceKes ?? null } }) },
    });
    const after = await tx.vehicle.findUniqueOrThrow({ where: { id }, select: { slug: true } });
    return { before, after };
  });

  if (before.publicationState === 'published') invalidateInventory(before.slug, after.slug);
  return getAdminVehicle(id);
}

export async function changePublication(staff: StaffProfile, id: string, input: z.infer<typeof publicationChangeSchema>) {
  const target: PublicationState = input.publicationState;
  const vehicle = await db.$transaction(async tx => {
    const v = await loadForUpdate(tx, id);
    if (v.publicationState === target) throw new ApiError(409, 'no_change', `This vehicle is already ${target}.`);
    if (target === 'published') {
      const blockers = publishBlockers(v, v._count.images);
      if (blockers.length) throw new ApiError(422, 'incomplete_listing', `Add the following before publishing: ${blockers.join(', ')}.`, { missing: blockers });
    }
    await updateWithVersion(tx, id, input.version, {
      publicationState: target,
      ...(target === 'published' && !v.publishedAt && { publishedAt: new Date() }),
    });
    await recordAudit(tx, { actorId: staff.id, action: `vehicle.${target === 'published' ? 'published' : target === 'draft' ? 'unpublished' : 'archived'}`, entityType: 'vehicle', entityId: id, changes: { publicationState: { from: v.publicationState, to: target } } });
    return v;
  });
  invalidateInventory(vehicle.slug);
  return getAdminVehicle(id);
}

export async function changeAvailability(staff: StaffProfile, id: string, input: z.infer<typeof availabilityChangeSchema>) {
  const target: Availability = input.availability;
  if (target === 'sold' && input.confirm !== true) {
    throw new ApiError(422, 'confirmation_required', 'Confirm that this vehicle has been sold.', { field: 'confirm' });
  }
  const vehicle = await db.$transaction(async tx => {
    const v = await loadForUpdate(tx, id);
    if (v.availability === target) throw new ApiError(409, 'no_change', `This vehicle is already ${target}.`);
    const correction = v.availability === 'sold';
    if (correction && !input.reason) {
      throw new ApiError(422, 'reason_required', 'Give a short reason for correcting a sold vehicle.', { field: 'reason' });
    }
    // The row lock taken by this UPDATE serializes against in-flight viewing requests (lib/services/leads.ts).
    await updateWithVersion(tx, id, input.version, { availability: target, soldAt: target === 'sold' ? new Date() : null });
    await recordAudit(tx, {
      actorId: staff.id,
      action: target === 'sold' ? 'vehicle.marked_sold' : correction ? 'vehicle.sold_corrected' : 'vehicle.availability_changed',
      entityType: 'vehicle',
      entityId: id,
      changes: { availability: { from: v.availability, to: target }, ...(input.reason && { reason: input.reason }) },
    });
    return v;
  });
  if (vehicle.publicationState === 'published') invalidateInventory(vehicle.slug);
  return getAdminVehicle(id);
}

/** Only never-enquired vehicles may be deleted; anything with leads must be archived. */
export async function deleteVehicle(staff: StaffProfile, id: string) {
  const { vehicle, keys } = await db.$transaction(async tx => {
    const vehicle = await tx.vehicle.findUnique({ where: { id }, include: { images: { select: { storageKey: true } }, _count: { select: { leads: true } } } });
    if (!vehicle) throw notFound('Vehicle');
    if (vehicle._count.leads > 0) throw new ApiError(409, 'has_leads', 'This vehicle has enquiries linked to it. Archive it instead of deleting.');
    if (vehicle.publicationState === 'published') throw new ApiError(409, 'is_published', 'Unpublish or archive this vehicle before deleting it.');
    await tx.vehicle.delete({ where: { id } });
    await recordAudit(tx, { actorId: staff.id, action: 'vehicle.deleted', entityType: 'vehicle', entityId: id, changes: { slug: vehicle.slug, make: vehicle.make, model: vehicle.model } });
    return { vehicle, keys: vehicle.images.map(i => i.storageKey) };
  });
  await removeStoredImages(keys);
  if (vehicle.publishedAt) invalidateInventory(vehicle.slug);
}

async function assertLocation(locationId: string) {
  const exists = await db.location.findUnique({ where: { id: locationId }, select: { id: true } });
  if (!exists) throw new ApiError(422, 'validation_failed', 'Choose an existing location.', { fields: { locationId: 'Choose an existing location.' } });
}
