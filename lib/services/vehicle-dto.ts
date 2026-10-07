import 'server-only';
import type { Prisma } from '@/lib/generated/prisma/client';
import { publicImageUrl } from '@/lib/supabase/server';

/** KES minor units (cents) ⇄ whole shillings. */
export const kesToMinor = (kes: number) => BigInt(kes) * 100n;
export const minorToKes = (minor: bigint) => Number(minor / 100n);

/** Only fields that are safe to show buyers. Never add lead or staff data here. */
export const publicVehicleSelect = {
  id: true,
  slug: true,
  make: true,
  model: true,
  year: true,
  priceAmount: true,
  currency: true,
  mileageKm: true,
  fuelType: true,
  transmission: true,
  availability: true,
  publishedAt: true,
  soldAt: true,
  updatedAt: true,
  location: { select: { id: true, name: true } },
  images: { select: { storageKey: true, altText: true, width: true, height: true }, orderBy: { position: 'asc' }, take: 1 },
} satisfies Prisma.VehicleSelect;

export const publicVehicleDetailSelect = {
  ...publicVehicleSelect,
  description: true,
  location: { select: { id: true, name: true, address: true, latitude: true, longitude: true, phone: true, hours: true } },
  images: { select: { storageKey: true, altText: true, width: true, height: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.VehicleSelect;

type CardRow = Prisma.VehicleGetPayload<{ select: typeof publicVehicleSelect }>;
type DetailRow = Prisma.VehicleGetPayload<{ select: typeof publicVehicleDetailSelect }>;

export function toPublicImage(image: { storageKey: string; altText: string; width: number; height: number }) {
  return { url: publicImageUrl(image.storageKey), alt: image.altText, width: image.width, height: image.height };
}

/** Plain JSON (no BigInt/Decimal) so results can be cached and sent to clients. */
export function toVehicleCard(v: CardRow) {
  return {
    id: v.id,
    slug: v.slug,
    title: `${v.year} ${v.make} ${v.model}`,
    make: v.make,
    model: v.model,
    year: v.year!,
    price: { amount: minorToKes(v.priceAmount!), currency: v.currency },
    mileageKm: v.mileageKm!,
    fuelType: v.fuelType!,
    transmission: v.transmission!,
    availability: v.availability,
    location: v.location,
    coverImage: v.images[0] ? toPublicImage(v.images[0]) : null,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    updatedAt: v.updatedAt.toISOString(),
  };
}

export function toVehicleDetail(v: DetailRow) {
  return {
    ...toVehicleCard({ ...v, images: v.images.slice(0, 1), location: v.location && { id: v.location.id, name: v.location.name } }),
    description: v.description ?? '',
    soldAt: v.soldAt?.toISOString() ?? null,
    images: v.images.map(toPublicImage),
    location: v.location && {
      ...v.location,
      latitude: v.location.latitude?.toNumber() ?? null,
      longitude: v.location.longitude?.toNumber() ?? null,
    },
    /** What the buyer may do right now. Sold cars cannot take viewing requests. */
    actions: { enquire: true, requestViewing: v.availability !== 'sold' },
  };
}

export type VehicleCard = ReturnType<typeof toVehicleCard>;
export type VehicleDetail = ReturnType<typeof toVehicleDetail>;
