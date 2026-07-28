import type { Prisma } from "@prisma/client";

/** Update clinics still using the previous organization base currency (not custom overrides). */
export async function syncInheritedClinicCurrencies(
  db: Prisma.TransactionClient,
  tenantId: string,
  previousBaseCurrency: string,
  nextBaseCurrency: string,
): Promise<number> {
  if (previousBaseCurrency === nextBaseCurrency) return 0;
  const result = await db.clinic.updateMany({
    where: { tenantId, defaultCurrency: previousBaseCurrency },
    data: { defaultCurrency: nextBaseCurrency },
  });
  return result.count;
}
