import 'server-only';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { Prisma, type Availability, type Lead } from '@/lib/generated/prisma/client';
import { ApiError } from '@/lib/http';
import type { LeadSubmission } from '@/lib/validation/lead';
import { getAlternatives } from './public-inventory';

export type LeadReceipt = {
  leadId: string;
  type: 'enquiry' | 'viewing';
  status: 'received';
  message: string;
  /** Replayed submission with the same idempotency key. */
  duplicate: boolean;
};

/** `stored` is internal (false for honeypot hits) and must not be sent to the client. */
export type LeadResult = LeadReceipt & { stored: boolean };

function receipt(lead: Pick<Lead, 'id' | 'type'>, duplicate: boolean, availability?: Availability, stored = true): LeadResult {
  let message = 'Your enquiry has been received. Our team will contact you.';
  if (lead.type === 'viewing') message += ' Your preferred time will be confirmed by our team.';
  if (availability === 'reserved') message += ' This car is currently reserved, so we will confirm whether it is still available.';
  return { leadId: lead.id, type: lead.type, status: 'received', message, duplicate, stored };
}

/**
 * Durably records a lead and its pending delivery in one transaction.
 * Success is returned only after commit; upstream delivery happens later.
 */
export async function createLead(input: LeadSubmission): Promise<LeadResult> {
  // Bots that fill the honeypot get an indistinguishable success and nothing is stored.
  if (input.isBot) return receipt({ id: randomUUID(), type: input.type }, false, undefined, false);

  const existing = await db.lead.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, type: true } });
  if (existing) return receipt(existing, true);

  try {
    return await db.$transaction(async tx => {
      let availability: Availability | undefined;
      if (input.vehicleId) {
        // Lock the vehicle row against concurrent "mark sold" so a stale page
        // can never create a viewing request for a car that just sold.
        const [vehicle] = await tx.$queryRaw<{ publication_state: string; availability: Availability }[]>`
          SELECT publication_state, availability FROM vehicles WHERE id = ${input.vehicleId}::uuid FOR SHARE`;
        if (!vehicle || vehicle.publication_state !== 'published') {
          throw new ApiError(422, 'vehicle_unavailable', 'This vehicle is no longer listed. Please browse our available vehicles.');
        }
        if (vehicle.availability === 'sold' && input.type === 'viewing') {
          throw new ApiError(409, 'vehicle_sold', 'Sorry, this car has just been sold, so viewings are no longer available. You can still send an enquiry or browse similar cars.');
        }
        availability = vehicle.availability;
      }

      const { isBot: _bot, idempotencyKey, ...data } = input;
      const lead = await tx.lead.create({
        data: { ...data, idempotencyKey, source: 'website', delivery: { create: {} } },
        select: { id: true, type: true },
      });
      return receipt(lead, false, availability);
    });
  } catch (error) {
    // Two identical submissions raced: return the one that won.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await db.lead.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, type: true } });
      if (winner) return receipt(winner, true);
    }
    if (error instanceof ApiError && error.code === 'vehicle_sold' && input.vehicleId) {
      const vehicle = await db.vehicle.findUnique({ where: { id: input.vehicleId }, select: { make: true, priceAmount: true } });
      const alternatives = vehicle ? await getAlternatives(input.vehicleId, vehicle.make, vehicle.priceAmount) : [];
      throw new ApiError(error.status, error.code, error.message, { alternatives });
    }
    throw error;
  }
}
