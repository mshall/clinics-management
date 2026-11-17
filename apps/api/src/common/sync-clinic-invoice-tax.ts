import type { Prisma } from "@prisma/client";

/** Stored org TRN: empty/null means inherit market pack (no placeholder). */
export function normalizeOrgTaxRegistrationNumber(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toUpperCase() === "N/A") return null;
  return trimmed;
}

/** Apply organization invoice tax settings to every clinic in the tenant. */
export async function syncClinicInvoiceTaxFromTenant(
  db: Prisma.TransactionClient,
  tenantId: string,
  taxRegistrationNumber: string | null,
  invoiceVatPercent: number,
): Promise<number> {
  const result = await db.clinic.updateMany({
    where: { tenantId },
    data: {
      taxRegistrationNumber,
      invoiceVatPercent,
    },
  });
  return result.count;
}
