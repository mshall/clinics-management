import { Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";

const DEFAULT_FOUNDING_KEY = "FOUNDING_EG";

export type CohortAssignResult =
  | { assigned: false; reason: "closed" | "full" | "missing" }
  | { assigned: true; cohortKey: string; seatNumber: number; priceLockUntil: Date };

@Injectable()
export class CohortService {
  static addMonths(d: Date, months: number): Date {
    const out = new Date(d);
    out.setUTCMonth(out.getUTCMonth() + months);
    return out;
  }

  async remainingSlots(key: string, client: PrismaClient) {
    const row = await client.cohort.findUnique({ where: { key } });
    if (!row) return { key, remaining: 0, cap: 0, assignedCount: 0 };
    const now = new Date();
    if (row.opensAt > now || (row.closesAt && row.closesAt <= now)) {
      return { key, remaining: 0, cap: row.cap, assignedCount: row.assignedCount };
    }
    return {
      key,
      remaining: Math.max(0, row.cap - row.assignedCount),
      cap: row.cap,
      assignedCount: row.assignedCount,
    };
  }

  /**
   * Atomic seat assignment; safe under concurrent signups.
   */
  async tryAssignFounding(
    tx: Prisma.TransactionClient,
    input: { marketId: string; subscriptionId: string; cohortKey?: string; at?: Date },
  ): Promise<CohortAssignResult> {
    const key = input.cohortKey?.trim() || DEFAULT_FOUNDING_KEY;
    const at = input.at ?? new Date();
    const rows = await tx.$queryRaw<
      { key: string; assignedCount: number; priceLockMonths: number }[]
    >`
      UPDATE "Cohort"
      SET "assignedCount" = "assignedCount" + 1, "updatedAt" = ${at}
      WHERE "key" = ${key}
        AND "marketId" = ${input.marketId}
        AND "assignedCount" < "cap"
        AND "opensAt" <= ${at}
        AND ("closesAt" IS NULL OR "closesAt" > ${at})
      RETURNING "key", "assignedCount", "priceLockMonths"
    `;
    const row = rows[0];
    if (!row) {
      const exists = await tx.cohort.findUnique({ where: { key } });
      if (!exists) return { assigned: false, reason: "missing" };
      if (exists.assignedCount >= exists.cap) return { assigned: false, reason: "full" };
      return { assigned: false, reason: "closed" };
    }
    const priceLockUntil = CohortService.addMonths(at, row.priceLockMonths);
    await tx.subscription.update({
      where: { id: input.subscriptionId },
      data: {
        cohortKey: key,
        priceLockUntil,
      },
    });
    return {
      assigned: true,
      cohortKey: key,
      seatNumber: row.assignedCount,
      priceLockUntil,
    };
  }
}