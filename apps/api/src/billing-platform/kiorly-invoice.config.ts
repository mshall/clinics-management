/** Default payment terms when market pack omits `kiorlyBilling.invoiceDueDays`. */
export const DEFAULT_KIORLY_INVOICE_DUE_DAYS = 7;

export function kiorlyInvoiceDueDaysFromMarket(featureDefaults: unknown): number {
  if (!featureDefaults || typeof featureDefaults !== "object" || Array.isArray(featureDefaults)) {
    return DEFAULT_KIORLY_INVOICE_DUE_DAYS;
  }
  const billing = (featureDefaults as Record<string, unknown>).kiorlyBilling;
  if (!billing || typeof billing !== "object" || Array.isArray(billing)) {
    return DEFAULT_KIORLY_INVOICE_DUE_DAYS;
  }
  const days = (billing as Record<string, unknown>).invoiceDueDays;
  if (typeof days === "number" && Number.isFinite(days) && days >= 1 && days <= 90) {
    return Math.floor(days);
  }
  return DEFAULT_KIORLY_INVOICE_DUE_DAYS;
}