import type { Prisma } from "@prisma/client";

type Tx = {
  onboardingProgress: {
    upsert: (args: Prisma.OnboardingProgressUpsertArgs) => Promise<unknown>;
  };
};

/** Create empty progress row during signup provision (ON-04 / ON-01). */
export async function ensureOnboardingProgress(tx: Tx, tenantId: string): Promise<void> {
  await tx.onboardingProgress.upsert({
    where: { tenantId },
    create: { tenantId, stepsJson: {} },
    update: {},
  });
}