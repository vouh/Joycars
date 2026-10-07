import { z } from 'zod';

/** Treats '', null and undefined as absent — HTML forms submit empty strings. */
export const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

export const requiredText = (max: number, min = 1) => z.string().trim().min(min, 'This field is required.').max(max, `Use at most ${max} characters.`);

export const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max, `Use at most ${max} characters.`).optional());

/** Accepts a form/JSON value, returning a trimmed string or null (clears the field). */
export const nullableText = (max: number) =>
  z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max, `Use at most ${max} characters.`).nullable());

export const uuid = z.uuid('Invalid identifier.');

export const pageSchema = {
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
};

/** Optimistic concurrency token sent back with every vehicle mutation. */
export const versionSchema = z.coerce.number().int().min(1);
