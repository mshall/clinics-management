import type { Prisma } from "@prisma/client";

export const DEFAULT_ORG_TAX_REGISTRATION_NUMBER = "N/A";
export const DEFAULT_ORG_INVOICE_VAT_PERCENT = 5;

export function normalizeOrgTaxRegistrationNumber(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : DEFAULT_ORG_TAX_REGISTRATION_NUMBER;
}

/** Apply organization invoice tax settings to every clinic in the tenant. */
export async function syncClinicInvoiceTaxFromTenant(
  db: Prisma.TransactionClient,
  tenantId: string,
  taxRegistrationNumber: string,
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
