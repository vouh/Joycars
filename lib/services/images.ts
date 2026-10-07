import 'server-only';
import { randomUUID } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import { recordAudit } from '@/lib/audit';
import { invalidateInventory } from '@/lib/cache';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import type { StaffProfile } from '@/lib/generated/prisma/client';
import { ApiError, notFound } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase/server';
import { toPublicImage } from './vehicle-dto';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGES_PER_VEHICLE = 30;
const MIN_WIDTH = 640;
const MIN_HEIGHT = 480;
const MAX_INPUT_PIXELS = 50_000_000;
const OUTPUT_MAX_EDGE = 2000;
/** Formats accepted after decoding — the client's MIME type and file name are never trusted. SVG/GIF are rejected. */
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif']);

/**
 * Decodes the upload, rejects anything that isn't a real raster photo, and
 * produces a normalized WebP. sharp drops EXIF (including GPS location) unless
 * asked to keep it; `.rotate()` bakes in the EXIF orientation first.
 */
export async function normalizeImage(input: Buffer) {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new ApiError(413, 'image_too_large', 'Photos must be 15 MB or smaller.');
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new ApiError(422, 'invalid_image', 'This file is not a supported photo. Upload a JPEG, PNG, WebP or AVIF image.');
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
    throw new ApiError(422, 'invalid_image', 'Upload a JPEG, PNG, WebP or AVIF photo. SVG, GIF and other formats are not accepted.');
  }
  if ((meta.pages ?? 1) > 1) throw new ApiError(422, 'invalid_image', 'Animated or multi-page images are not accepted.');

  const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: OUTPUT_MAX_EDGE, height: OUTPUT_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  if (info.width < MIN_WIDTH || info.height < MIN_HEIGHT) {
    throw new ApiError(422, 'image_too_small', `Photos must be at least ${MIN_WIDTH}×${MIN_HEIGHT} pixels.`);
  }
  return { data, width: info.width, height: info.height, bytes: info.size };
}

export async function addVehicleImage(staff: StaffProfile, vehicleId: string, file: File, altText: string) {
  const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId }, select: { slug: true, publicationState: true, _count: { select: { images: true } } } });
  if (!vehicle) throw notFound('Vehicle');
  if (vehicle._count.images >= MAX_IMAGES_PER_VEHICLE) throw new ApiError(422, 'too_many_images', `A vehicle can have at most ${MAX_IMAGES_PER_VEHICLE} photos.`);

  const image = await normalizeImage(Buffer.from(await file.arrayBuffer()));
  // Server-generated key: a client-supplied path is never used as authority.
  const storageKey = `vehicles/${vehicleId}/${randomUUID()}.webp`;
  const { error } = await supabaseAdmin().storage.from(env().SUPABASE_IMAGES_BUCKET).upload(storageKey, image.data, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    console.error('[images] upload failed', error.message);
    throw new ApiError(502, 'storage_unavailable', 'The photo could not be stored. Please try again.');
  }

  try {
    const created = await db.$transaction(async tx => {
      const last = await tx.vehicleImage.findFirst({ where: { vehicleId }, orderBy: { position: 'desc' }, select: { position: true } });
      const row = await tx.vehicleImage.create({
        data: { vehicleId, storageKey, altText, position: (last?.position ?? -1) + 1, width: image.width, height: image.height, bytes: image.bytes },
      });
      await tx.vehicle.update({ where: { id: vehicleId }, data: { updatedAt: new Date() } });
      await recordAudit(tx, { actorId: staff.id, action: 'vehicle_image.added', entityType: 'vehicle', entityId: vehicleId, changes: { imageId: row.id } });
      return row;
    });
    if (vehicle.publicationState === 'published') invalidateInventory(vehicle.slug);
    return { id: created.id, position: created.position, ...toPublicImage(created), bytes: created.bytes };
  } catch (err) {
    await removeStoredImages([storageKey]); // don't leave orphaned objects behind
    throw err;
  }
}

/** Sets the full display order; the first image becomes the cover. */
export async function reorderVehicleImages(staff: StaffProfile, vehicleId: string, imageIds: string[]) {
  const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId }, select: { slug: true, publicationState: true } });
  if (!vehicle) throw notFound('Vehicle');
  await db.$transaction(async tx => {
    const existing = await tx.vehicleImage.findMany({ where: { vehicleId }, select: { id: true } });
    const known = new Set(existing.map(i => i.id));
    if (imageIds.length !== known.size || !imageIds.every(id => known.has(id))) {
      throw new ApiError(422, 'invalid_order', 'Send every photo of this vehicle exactly once.');
    }
    // Two phases so the (vehicle_id, position) unique constraint never collides mid-update.
    await tx.$executeRaw`UPDATE vehicle_images SET position = position + 100000 WHERE vehicle_id = ${vehicleId}::uuid`;
    for (const [position, id] of imageIds.entries()) await tx.vehicleImage.update({ where: { id }, data: { position } });
    await tx.vehicle.update({ where: { id: vehicleId }, data: { updatedAt: new Date() } });
    await recordAudit(tx, { actorId: staff.id, action: 'vehicle_image.reordered', entityType: 'vehicle', entityId: vehicleId, changes: { coverImageId: imageIds[0] } });
  });
  if (vehicle.publicationState === 'published') invalidateInventory(vehicle.slug);
}

export async function updateVehicleImage(staff: StaffProfile, vehicleId: string, imageId: string, altText: string) {
  const image = await db.vehicleImage.findFirst({ where: { id: imageId, vehicleId }, include: { vehicle: { select: { slug: true, publicationState: true } } } });
  if (!image) throw notFound('Photo');
  await db.$transaction(async tx => {
    await tx.vehicleImage.update({ where: { id: imageId }, data: { altText } });
    await recordAudit(tx, { actorId: staff.id, action: 'vehicle_image.updated', entityType: 'vehicle', entityId: vehicleId, changes: { imageId, fields: ['altText'] } });
  });
  if (image.vehicle.publicationState === 'published') invalidateInventory(image.vehicle.slug);
}

export async function deleteVehicleImage(staff: StaffProfile, vehicleId: string, imageId: string) {
  const image = await db.vehicleImage.findFirst({ where: { id: imageId, vehicleId }, include: { vehicle: { select: { slug: true, publicationState: true } } } });
  if (!image) throw notFound('Photo');
  await db.$transaction(async tx => {
    if (image.vehicle.publicationState === 'published') {
      const count = await tx.vehicleImage.count({ where: { vehicleId } });
      if (count <= 1) throw new ApiError(409, 'last_photo', 'A published vehicle needs at least one photo. Upload another first.');
    }
    await tx.vehicleImage.delete({ where: { id: imageId } });
    // Close the gap so positions stay contiguous and the cover stays at 0.
    await tx.$executeRaw`UPDATE vehicle_images SET position = position + 100000 WHERE vehicle_id = ${vehicleId}::uuid AND position > ${image.position}`;
    await tx.$executeRaw`UPDATE vehicle_images SET position = position - 100001 WHERE vehicle_id = ${vehicleId}::uuid AND position > 100000`;
    await tx.vehicle.update({ where: { id: vehicleId }, data: { updatedAt: new Date() } });
    await recordAudit(tx, { actorId: staff.id, action: 'vehicle_image.deleted', entityType: 'vehicle', entityId: vehicleId, changes: { imageId } });
  });
  await removeStoredImages([image.storageKey]);
  if (image.vehicle.publicationState === 'published') invalidateInventory(image.vehicle.slug);
}

/** Best effort: a failed cleanup must not fail the user's action. */
export async function removeStoredImages(keys: string[]) {
  if (!keys.length) return;
  const { error } = await supabaseAdmin().storage.from(env().SUPABASE_IMAGES_BUCKET).remove(keys);
  if (error) console.error('[images] cleanup failed', { count: keys.length, message: error.message });
}
