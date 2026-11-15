/** Returns true when demo users/passwords must not be created (production deploy). */
export function isDemoSeedBlockedInProduction(): boolean {
  return process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true";
}

export function assertDemoPasswordAllowedInProduction(passwordPlain: string): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.ALLOW_DEMO_SEED === "true") return;
  if (passwordPlain === "demo") {
    throw new Error(
      "Refusing to seed users with password 'demo' in production. Set ALLOW_DEMO_SEED=true only for intentional demo stacks.",
    );
  }
}