import type { VisitCollectionMode } from "@prisma/client";

/** ETA payment method code (C = cash, V = visa/card, O = other / transfer). */
export function paymentMethodFromCollection(
  mode?: VisitCollectionMode | null,
  transferChannel?: string | null,
): string {
  if (transferChannel?.trim()) return "O";
  if (mode === "CASH_ON_VISIT") return "C";
  return "C";
}