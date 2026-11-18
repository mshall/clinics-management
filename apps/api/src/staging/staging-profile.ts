/** QA-06 — staging / sales demo profile detection. */
export function isStagingProfile(): boolean {
  return (process.env.KIORLY_ENV ?? "").trim().toLowerCase() === "staging";
}

export function applyStagingEnvDefaults(): void {
  // Staging sandboxes for payments/messaging are configured per provider env vars.
}

export function assertSalesDemoResetAllowed(): void {
  if (process.env.ALLOW_DEMO_RESET === "true") return;
  if (isStagingProfile()) return;
  if (process.env.NODE_ENV !== "production") return;
  throw new Error(
    "Sales demo reset is disabled in production. Set KIORLY_ENV=staging or ALLOW_DEMO_RESET=true on intentional demo stacks.",
  );
}