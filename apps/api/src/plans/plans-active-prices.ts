import type { PlanPrice, Prisma } from "@prisma/client";

export const ACTIVE_PRICE_WHERE = (at: Date = new Date()): Prisma.PlanPriceWhereInput => ({
  validFrom: { lte: at },
  OR: [{ validTo: null }, { validTo: { gt: at } }],
});

export function isPlanPriceActive(price: Pick<PlanPrice, "validFrom" | "validTo">, at: Date = new Date()): boolean {
  if (price.validFrom > at) return false;
  if (price.validTo != null && price.validTo <= at) return false;
  return true;
}