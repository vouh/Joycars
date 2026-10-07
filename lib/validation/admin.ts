import { z } from 'zod';
import { nullableText, requiredText } from './common';

const coordinate = (min: number, max: number) => z.preprocess(v => (v === '' ? null : v), z.coerce.number().min(min).max(max).nullable());

export const locationCreateSchema = z.object({
  name: requiredText(120),
  address: requiredText(300),
  latitude: coordinate(-90, 90).optional(),
  longitude: coordinate(-180, 180).optional(),
  phone: nullableText(32).optional(),
  hours: nullableText(300).optional(),
});

export const locationUpdateSchema = locationCreateSchema.partial().refine(v => Object.keys(v).length > 0, 'No changes were supplied.');

export const staffInviteSchema = z.object({
  email: z.email('Enter a valid email address.').trim().toLowerCase().max(254),
  role: z.enum(['staff', 'admin']).default('staff'),
});

export const staffUpdateSchema = z
  .object({ role: z.enum(['staff', 'admin']), active: z.boolean() })
  .partial()
  .refine(v => Object.keys(v).length > 0, 'No changes were supplied.');

export const signInSchema = z.object({ email: z.email('Enter a valid email address.').trim().toLowerCase().max(254) });

export const passwordSignInSchema = signInSchema.extend({ password: z.string().min(1, 'Enter your password.').max(200) });
