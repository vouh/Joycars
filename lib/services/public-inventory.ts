import 'server-only';
import { unstable_cache } from 'next/cache';
import { INVENTORY_TAG, LOCATIONS_TAG, PUBLIC_REVALIDATE_SECONDS } from '@/lib/cache';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import type { PublicSearch } from '@/lib/validation/vehicle';
import { kesToMinor, publicVehicleDetailSelect, publicVehicleSelect, toVehicleCard, toVehicleDetail, type VehicleCard } from './vehicle-dto';

/** Buyers only ever see published vehicles; drafts and archived stock never leak. */
const PUBLIC_WHERE = { publicationState: 'published' } satisfies Prisma.VehicleWhereInput;
/** Available inventory excludes sold stock (sold pages stay reachable by URL). */
const LISTABLE_WHERE = { ...PUBLIC_WHERE, availability: { in: ['available', 'reserved'] } } satisfies Prisma.VehicleWhereInput;

function searchWhere(s: PublicSearch): Prisma.VehicleWhereInput {
  const and: Prisma.VehicleWhereInput[] = [LISTABLE_WHERE];
  if (s.q) {
    for (const term of s.q.split(/\s+/).filter(Boolean).slice(0, 5)) {
      and.push({ OR: [{ make: { contains: term, mode: 'insensitive' } }, { model: { contains: term, mode: 'insensitive' } }] });
    }
  }
  if (s.minPrice !== undefined || s.maxPrice !== undefined) {
    and.push({ priceAmount: { gte: s.minPrice !== undefined ? kesToMinor(s.minPrice) : undefined, lte: s.maxPrice !== undefined ? kesToMinor(s.maxPrice) : undefined } });
  }
  if (s.minYear !== undefined || s.maxYear !== undefined) and.push({ year: { gte: s.minYear, lte: s.maxYear } });
  if (s.fuel) and.push({ fuelType: s.fuel });
  if (s.transmission) and.push({ transmission: s.transmission });
  if (s.location) and.push({ locationId: s.location });
  return { AND: and };
}

/** Deterministic ordering with an ID tie-breaker so pagination never skips or repeats. */
function searchOrder(sort: PublicSearch['sort']): Prisma.VehicleOrderByWithRelationInput[] {
  if (sort === 'price_asc') return [{ priceAmount: 'asc' }, { id: 'asc' }];
  if (sort === 'price_desc') return [{ priceAmount: 'desc' }, { id: 'asc' }];
  return [{ publishedAt: 'desc' }, { id: 'asc' }];
}

async function searchUncached(s: PublicSearch) {
  const where = searchWhere(s);
  const [total, rows] = await db.$transaction([
    db.vehicle.count({ where }),
    db.vehicle.findMany({ where, select: publicVehicleSelect, orderBy: searchOrder(s.sort), skip: (s.page - 1) * s.pageSize, take: s.pageSize }),
  ]);
  return {
    items: rows.map(toVehicleCard),
    page: s.page,
    pageSize: s.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / s.pageSize)),
  };
}

export const searchVehicles = unstable_cache(searchUncached, ['public-search'], { tags: [INVENTORY_TAG], revalidate: PUBLIC_REVALIDATE_SECONDS });

export const getFeaturedVehicles = unstable_cache(
  async (limit = 6): Promise<VehicleCard[]> => {
    const rows = await db.vehicle.findMany({ where: LISTABLE_WHERE, select: publicVehicleSelect, orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }], take: limit });
    return rows.map(toVehicleCard);
  },
  ['public-featured'],
  { tags: [INVENTORY_TAG], revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export type VehicleLookup =
  | { kind: 'found'; vehicle: ReturnType<typeof toVehicleDetail>; alternatives: VehicleCard[] }
  | { kind: 'redirect'; slug: string }
  | { kind: 'not_found' };

async function getVehicleBySlugUncached(slug: string): Promise<VehicleLookup> {
  const row = await db.vehicle.findFirst({ where: { slug, ...PUBLIC_WHERE }, select: publicVehicleDetailSelect });
  if (!row) {
    const redirect = await db.vehicleSlugRedirect.findUnique({ where: { slug }, select: { vehicle: { select: { slug: true, publicationState: true } } } });
    if (redirect && redirect.vehicle.publicationState === 'published') return { kind: 'redirect', slug: redirect.vehicle.slug };
    return { kind: 'not_found' };
  }
  const vehicle = toVehicleDetail(row);
  // Sold (and reserved) pages suggest similar available stock.
  const alternatives = vehicle.availability === 'available' ? [] : await getAlternatives(row.id, row.make, row.priceAmount);
  return { kind: 'found', vehicle, alternatives };
}

export const getPublicVehicleBySlug = unstable_cache(getVehicleBySlugUncached, ['public-vehicle'], { tags: [INVENTORY_TAG], revalidate: PUBLIC_REVALIDATE_SECONDS });

/** Up to 4 available cars: same make first, then nearest in price. */
export async function getAlternatives(excludeId: string, make: string, priceAmount: bigint | null, limit = 4): Promise<VehicleCard[]> {
  const where = { ...LISTABLE_WHERE, availability: 'available' as const, id: { not: excludeId } };
  const sameMake = await db.vehicle.findMany({ where: { ...where, make: { equals: make, mode: 'insensitive' } }, select: publicVehicleSelect, orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }], take: limit });
  if (sameMake.length >= limit || priceAmount === null) return sameMake.map(toVehicleCard);
  const others = await db.vehicle.findMany({ where: { ...where, id: { notIn: [excludeId, ...sameMake.map(v => v.id)] } }, select: publicVehicleSelect, take: 50 });
  others.sort((a, b) => Number(abs(a.priceAmount! - priceAmount) - abs(b.priceAmount! - priceAmount)));
  return [...sameMake, ...others].slice(0, limit).map(toVehicleCard);
}

const abs = (n: bigint) => (n < 0n ? -n : n);

export const getPublicLocations = unstable_cache(
  async () => {
    const rows = await db.location.findMany({ orderBy: { name: 'asc' } });
    return rows.map(l => ({ id: l.id, name: l.name, address: l.address, phone: l.phone, hours: l.hours, latitude: l.latitude?.toNumber() ?? null, longitude: l.longitude?.toNumber() ?? null }));
  },
  ['public-locations'],
  { tags: [LOCATIONS_TAG], revalidate: 3600 },
);

/** Make/fuel/year facets for building filter controls from real stock. */
export const getSearchFacets = unstable_cache(
  async () => {
    const [makes, ranges] = await Promise.all([
      db.vehicle.groupBy({ by: ['make'], where: LISTABLE_WHERE, _count: { _all: true }, orderBy: { make: 'asc' } }),
      db.vehicle.aggregate({ where: LISTABLE_WHERE, _min: { priceAmount: true, year: true }, _max: { priceAmount: true, year: true } }),
    ]);
    return {
      makes: makes.map(m => ({ make: m.make, count: m._count._all })),
      price: { min: ranges._min.priceAmount === null ? null : Number(ranges._min.priceAmount / 100n), max: ranges._max.priceAmount === null ? null : Number(ranges._max.priceAmount / 100n) },
      year: { min: ranges._min.year, max: ranges._max.year },
    };
  },
  ['public-facets'],
  { tags: [INVENTORY_TAG], revalidate: PUBLIC_REVALIDATE_SECONDS },
);

export async function getSitemapVehicles() {
  return db.vehicle.findMany({ where: PUBLIC_WHERE, select: { slug: true, updatedAt: true }, orderBy: { publishedAt: 'desc' } });
}
