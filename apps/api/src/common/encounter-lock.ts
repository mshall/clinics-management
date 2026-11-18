import { ConflictException, NotFoundException } from "@nestjs/common";
import { EncounterStatus, type Prisma, type PrismaClient } from "@prisma/client";

export const DEFAULT_ENCOUNTER_AUTO_LOCK_HOURS = 72;
export const ENCOUNTER_LOCKED_CODE = "ENCOUNTER_LOCKED";

type LockFields = { status: EncounterStatus; finalizedAt: Date | null; noteLockedAt: Date | null };
type Db = PrismaClient | Prisma.TransactionClient;

export function autoLockHours(raw: number | null | undefined): number {
  return raw != null && Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_ENCOUNTER_AUTO_LOCK_HOURS;
}

/** When a signed note locks (already-locked time, or finalizedAt + window). Null for drafts and amended notes. */
export function encounterLockAt(enc: LockFields, hours: number): Date | null {
  if (enc.status !== EncounterStatus.FINALIZED) return null;
  if (enc.noteLockedAt) return enc.noteLockedAt;
  if (!enc.finalizedAt) return null;
  return new Date(enc.finalizedAt.getTime() + hours * 3600_000);
}

export function isEncounterLocked(enc: LockFields, hours: number, now: Date = new Date()): boolean {
  const at = encounterLockAt(enc, hours);
  return at != null && now.getTime() >= at.getTime();
}

export function encounterLockedError(): ConflictException {
  return new ConflictException({
    message: "Encounter note is locked — use Amend to reopen with a documented reason",
    errorCode: ENCOUNTER_LOCKED_CODE,
    messageKey: "errors.encounterLocked",
  });
}

/**
 * Lazily persists a due auto-lock and returns the effective noteLockedAt.
 * Every write path that touches a signed note must call this (or assertEncounterWritable) first.
 */
export async function syncEncounterLock(db: Db, tenantId: string, encounterId: string): Promise<Date | null> {
  const enc = await db.encounter.findFirst({
    where: { id: encounterId, tenantId },
    select: { status: true, finalizedAt: true, noteLockedAt: true, tenant: { select: { encounterAutoLockHours: true } } },
  });
  if (!enc) throw new NotFoundException("Encounter not found");
  if (enc.noteLockedAt || enc.status !== EncounterStatus.FINALIZED) {
    return enc.status === EncounterStatus.FINALIZED ? enc.noteLockedAt : null;
  }
  const hours = autoLockHours(enc.tenant.encounterAutoLockHours);
  if (!isEncounterLocked(enc, hours)) return null;
  const lockAt = encounterLockAt(enc, hours)!;
  await db.encounter.updateMany({
    where: { id: encounterId, tenantId, noteLockedAt: null, status: EncounterStatus.FINALIZED },
    data: { noteLockedAt: lockAt },
  });
  return lockAt;
}

export async function assertEncounterWritable(db: Db, tenantId: string, encounterId: string): Promise<void> {
  if (await syncEncounterLock(db, tenantId, encounterId)) throw encounterLockedError();
}
