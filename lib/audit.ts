import 'server-only';
import type { Prisma } from '@/lib/generated/prisma/client';

type Tx = Prisma.TransactionClient;

export type AuditInput = {
  actorId: string | null;
  action: string;
  entityType: 'vehicle' | 'vehicle_image' | 'location' | 'lead' | 'staff';
  entityId: string;
  /** Safe field names/values only. Never pass customer contact details or secrets. */
  changes?: Prisma.InputJsonValue;
};

export function recordAudit(tx: Tx, event: AuditInput) {
  return tx.auditEvent.create({ data: event });
}
