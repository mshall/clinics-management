/** QA-06 — staging / sales demo profile detection. */
export function isStagingProfile(): boolean {
  return (process.env.KIORLY_ENV ?? "").trim().toLowerCase() === "staging";
}

/** Egypt ETA pre-production API host (override via ETA_API_BASE_URL). */
export const ETA_PREPROD_BASE_URL = "https://api.preprod.invoicing.eta.gov.eg";

export function applyStagingEnvDefaults(): void {
  if (!isStagingProfile()) return;
  if (!process.env.ETA_API_BASE_URL?.trim()) {
    process.env.ETA_API_BASE_URL = ETA_PREPROD_BASE_URL;
  }
  if (!process.env.ETA_TOKEN_URL?.trim()) {
    process.env.ETA_TOKEN_URL = `${ETA_PREPROD_BASE_URL}/connect/token`;
  }
}

export function assertSalesDemoResetAllowed(): void {
  if (process.env.ALLOW_DEMO_RESET === "true") return;
  if (isStagingProfile()) return;
  if (process.env.NODE_ENV !== "production") return;
  throw new Error(
    "Sales demo reset is disabled in production. Set KIORLY_ENV=staging or ALLOW_DEMO_RESET=true on intentional demo stacks.",
  );
}