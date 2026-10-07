import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';
import { parseNairobiLocal } from '@/lib/time';
import { blankToUndefined, optionalText, pageSchema, requiredText, uuid } from './common';

/** Viewing requests must be at least this far ahead and within this horizon. */
export const VIEWING_MIN_LEAD_MS = 30 * 60 * 1000;
export const VIEWING_MAX_AHEAD_DAYS = 90;

/** Accepts local Kenyan (0712 345 678) and international (+44 …) formats; returns E.164. */
export const phoneSchema = z
  .string()
  .trim()
  .min(6, 'Enter a valid phone number.')
  .max(32, 'Enter a valid phone number.')
  .transform((value, ctx) => {
    const phone = parsePhoneNumberFromString(value, 'KE');
    if (!phone?.isValid()) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number, e.g. 0712 345 678 or +254 712 345 678.' });
      return z.NEVER;
    }
    return phone.number;
  });

export function leadSubmissionSchema(now: () => Date = () => new Date()) {
  return z
    .object({
      idempotencyKey: uuid,
      type: z.enum(['enquiry', 'viewing']),
      expectedViewingFeeKes: z.number().int().min(1).max(150000).optional(),
      vehicleId: z.preprocess(blankToUndefined, uuid.optional()),
      name: requiredText(120, 2),
      phone: phoneSchema,
      email: z.preprocess(blankToUndefined, z.email('Enter a valid email address.').max(254).toLowerCase().optional()),
      message: optionalText(2000),
      /** Nairobi wall-clock time, `YYYY-MM-DDTHH:mm`. */
      preferredViewingTime: optionalText(16),
      utmSource: optionalText(100),
      utmMedium: optionalText(100),
      utmCampaign: optionalText(100),
      utmContent: optionalText(100),
      utmTerm: optionalText(100),
      /** Honeypot: hidden from people, filled in by naive bots. */
      website: z.string().max(500).optional(),
    })
    .transform((input, ctx) => {
      // Viewing requests get an emailed confirmation, so an address is required.
      const missingEmail = input.type === 'viewing' && !input.email;
      if (missingEmail) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter your email so we can send you a confirmation of your request.' });
      let preferredViewingAt: Date | undefined;
      if (input.type === 'viewing') {
        if (!input.preferredViewingTime) {
          ctx.addIssue({ code: 'custom', path: ['preferredViewingTime'], message: 'Choose a preferred date and time.' });
          return z.NEVER;
        }
        const parsed = parseNairobiLocal(input.preferredViewingTime);
        const current = now().getTime();
        if (!parsed) {
          ctx.addIssue({ code: 'custom', path: ['preferredViewingTime'], message: 'Enter a valid date and time.' });
          return z.NEVER;
        }
        if (parsed.getTime() < current + VIEWING_MIN_LEAD_MS) {
          ctx.addIssue({ code: 'custom', path: ['preferredViewingTime'], message: 'Choose a time later than now (Nairobi time).' });
          return z.NEVER;
        }
        if (parsed.getTime() > current + VIEWING_MAX_AHEAD_DAYS * 86_400_000) {
          ctx.addIssue({ code: 'custom', path: ['preferredViewingTime'], message: `Choose a time within the next ${VIEWING_MAX_AHEAD_DAYS} days.` });
          return z.NEVER;
        }
        preferredViewingAt = parsed;
      }
      if (missingEmail) return z.NEVER;
      const { preferredViewingTime: _ignored, website, expectedViewingFeeKes: _fee, ...rest } = input;
      return { ...rest, preferredViewingAt, isBot: Boolean(website?.trim()) };
    });
}

export type LeadSubmission = z.output<ReturnType<typeof leadSubmissionSchema>>;

export const adminLeadListSchema = z.object({
  type: z.preprocess(blankToUndefined, z.enum(['enquiry', 'viewing']).optional()),
  deliveryState: z.preprocess(blankToUndefined, z.enum(['pending', 'delivered', 'failed']).optional()),
  vehicleId: z.preprocess(blankToUndefined, uuid.optional()),
  /** Viewing requests whose preferred time is still ahead, soonest first. */
  upcoming: z.preprocess(blankToUndefined, z.enum(['true', 'false']).optional()).transform(v => v === 'true'),
  format: z.preprocess(blankToUndefined, z.enum(['json', 'csv']).default('json')),
  ...pageSchema,
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
