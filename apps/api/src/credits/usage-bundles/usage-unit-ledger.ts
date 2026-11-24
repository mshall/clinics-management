import { Prisma } from "@prisma/client";

/** Σ delta per unit: the unit ledger is never mixed with currency. */
export function unitBalances(rows: { unit: string; delta: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.unit] = (out[r.unit] ?? 0) + r.delta;
  return out;
}

export async function readUnitBalances(db: Pick<Prisma.TransactionClient, "usageUnitLedger">, tenantId: string): Promise<Record<string, number>> {
  const rows = await db.usageUnitLedger.groupBy({ by: ["unit"], where: { tenantId }, _sum: { delta: true } });
  return Object.fromEntries(rows.map((r) => [r.unit, r._sum.delta ?? 0]));
}
