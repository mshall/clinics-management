import { VerificationStatus, type Prisma, type PrismaClient } from "@prisma/client";
import type { ReverifyReason } from "./profession-verification";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * PRVER03 / hazard H11 — send a VERIFIED record back for review (or to EXPIRED for lapsed licences).
 * Plain DB helper so any module (admin user edit, scheduler, profession change) applies the identical transition.
 * Returns the verification id when a transition happened, else null (not verified / no record).
 */
export async function applyReverification(
  db: Db,
  userId: string,
  reason: ReverifyReason,
): Promise<{ id: string; tenantId: string; expired: boolean } | null> {
  const row = await db.clinicianVerification.findUnique({ where: { userId } });
  if (!row || row.status !== VerificationStatus.VERIFIED) return null;
  const expired = reason === "LICENCE_EXPIRED" || reason === "INTERVAL_ELAPSED";
  await db.clinicianVerification.update({
    where: { userId },
    data: {
      status: expired ? VerificationStatus.EXPIRED : VerificationStatus.PENDING,
      pendingAt: expired ? null : new Date(),
      reviewedAt: null,
      reviewDurationMs: null,
      rejectReason: null,
      rejectReasonCode: null,
      reverifyReason: reason,
      expiryReminderStage: 0,
    },
  });
  await db.professionalRegistration.updateMany({
    where: { userId },
    data: { status: expired ? VerificationStatus.EXPIRED : VerificationStatus.PENDING, verifiedAt: null },
  });
  return { id: row.id, tenantId: row.tenantId, expired };
}
