import 'server-only';
import { db } from '@/lib/db';
import { z } from 'zod';
import { recordAudit } from '@/lib/audit';
import type { StaffProfile } from '@/lib/generated/prisma/client';

export const viewingFeeSchema = z.object({ feeKes: z.coerce.number().int().min(1).max(150000) });
export async function getViewingFee() {
  return (await db.bookingSetting.findUnique({ where: { id: 'viewing' } }))?.feeKes ?? 5;
}
export async function setViewingFee(staff: StaffProfile, feeKes: number) {
  return db.$transaction(async tx => {
    const before = await tx.bookingSetting.findUnique({ where: { id: 'viewing' } });
    const saved = await tx.bookingSetting.upsert({ where: { id: 'viewing' }, create: { id: 'viewing', feeKes }, update: { feeKes } });
    await recordAudit(tx, { actorId: staff.id, action: 'viewing.fee_updated', entityType: 'booking_setting', entityId: 'viewing', changes: { before: before?.feeKes ?? 5, after: feeKes } });
    return saved;
  });
}
