import { z } from 'zod';
import { blankToUndefined, nullableText, optionalText, pageSchema, requiredText, uuid, versionSchema } from './common';

export const FUEL_TYPES = ['petrol', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'other'] as const;
export const TRANSMISSIONS = ['automatic', 'manual'] as const;
export const AVAILABILITY = ['available', 'reserved', 'sold'] as const;
export const PUBLICATION_STATES = ['draft', 'published', 'archived'] as const;

const MAX_YEAR = new Date().getUTCFullYear() + 1;
/** Prices are entered in whole Kenyan shillings and stored as minor units. */
export const MAX_PRICE_KES = 1_000_000_000;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens.');

const nullableInt = (min: number, max: number) =>
  z.preprocess(v => (v === '' ? null : v), z.coerce.number().int('Use a whole number.').min(min).max(max).nullable());

/** Editable vehicle fields. Everything except make/model may stay empty while drafting. */
const vehicleFields = {
  make: requiredText(60),
  model: requiredText(80),
  slug: z.preprocess(blankToUndefined, slugSchema.optional()),
  externalId: nullableText(100),
  year: nullableInt(1950, MAX_YEAR),
  priceKes: nullableInt(0, MAX_PRICE_KES),
  mileageKm: nullableInt(0, 2_000_000),
  fuelType: z.preprocess(v => (v === '' ? null : v), z.enum(FUEL_TYPES).nullable()),
  transmission: z.preprocess(v => (v === '' ? null : v), z.enum(TRANSMISSIONS).nullable()),
  locationId: z.preprocess(v => (v === '' ? null : v), uuid.nullable()),
  description: nullableText(5000),
};

export const vehicleCreateSchema = z.object(vehicleFields).partial({
  externalId: true, year: true, priceKes: true, mileageKm: true, fuelType: true, transmission: true, locationId: true, description: true,
});

export const vehicleUpdateSchema = z
  .object({ version: versionSchema, ...vehicleFields })
  .partial()
  .required({ version: true })
  .refine(v => Object.keys(v).length > 1, 'No changes were supplied.');

export const publicationChangeSchema = z.object({
  version: versionSchema,
  publicationState: z.enum(PUBLICATION_STATES),
});

export const availabilityChangeSchema = z
  .object({
    version: versionSchema,
    availability: z.enum(AVAILABILITY),
    /** Marking sold must be explicitly confirmed by the editor. */
    confirm: z.boolean().optional(),
    /** Required when correcting a sold vehicle back to available/reserved. */
    reason: optionalText(300),
  });

export const adminVehicleListSchema = z.object({
  q: optionalText(80),
  publicationState: z.preprocess(blankToUndefined, z.enum(PUBLICATION_STATES).optional()),
  availability: z.preprocess(blankToUndefined, z.enum(AVAILABILITY).optional()),
  ...pageSchema,
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const optionalInt = (min: number, max: number) => z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).optional());

/** Public search: an allowlisted, typed and bounded set of query parameters. */
export const publicSearchSchema = z
  .object({
    q: optionalText(80),
    minPrice: optionalInt(0, MAX_PRICE_KES),
    maxPrice: optionalInt(0, MAX_PRICE_KES),
    minYear: optionalInt(1950, MAX_YEAR),
    maxYear: optionalInt(1950, MAX_YEAR),
    fuel: z.preprocess(blankToUndefined, z.enum(FUEL_TYPES).optional()),
    transmission: z.preprocess(blankToUndefined, z.enum(TRANSMISSIONS).optional()),
    location: z.preprocess(blankToUndefined, uuid.optional()),
    sort: z.preprocess(blankToUndefined, z.enum(['newest', 'price_asc', 'price_desc']).default('newest')),
    ...pageSchema,
  })
  .refine(v => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, { path: ['maxPrice'], message: 'Maximum price must be at least the minimum.' })
  .refine(v => v.minYear === undefined || v.maxYear === undefined || v.minYear <= v.maxYear, { path: ['maxYear'], message: 'Latest year must be at least the earliest.' });

export type PublicSearch = z.infer<typeof publicSearchSchema>;

export const imageReorderSchema = z.object({
  imageIds: z.array(uuid).min(1).max(50).refine(ids => new Set(ids).size === ids.length, 'Each image may appear only once.'),
});

export const imageUpdateSchema = z.object({ altText: requiredText(200) });
