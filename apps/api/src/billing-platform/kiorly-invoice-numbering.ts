import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export function formatKiorlyInvoiceNumber(marketCode: string, year: number, sequence: number): string {
  const code = marketCode.trim().toUpperCase() || "XX";
  return `KIO-${code}-${year}-${String(sequence).padStart(6, "0")}`;
}

/**
 * Gapless per-market yearly sequence (PostgreSQL row lock via upsert + increment).
 */
export async function nextKiorlyInvoiceNumber(tx: Tx, marketId: string, marketCode: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "KiorlyInvoiceNumberSequence" ("id", "marketId", "year", "lastNumber", "updatedAt")
    VALUES (${randomUUID()}, ${marketId}, ${year}, 1, NOW())
    ON CONFLICT ("marketId", "year")
    DO UPDATE SET
      "lastNumber" = "KiorlyInvoiceNumberSequence"."lastNumber" + 1,
      "updatedAt" = NOW()
    RETURNING "lastNumber"
  `;
  const seq = rows[0]?.lastNumber;
  if (!seq || seq < 1) {
    throw new Error("Could not allocate Kiorly invoice number");
  }
  return formatKiorlyInvoiceNumber(marketCode, year, seq);
}