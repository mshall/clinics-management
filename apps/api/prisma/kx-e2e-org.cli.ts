/** Runs ensure/retire of the throwaway kx-test e2e organisation. Env: KX_E2E_ORG_ACTION=ensure|retire, KX_E2E_ORG_OWNER_PASSWORD (ensure only). Never prints the password. */
import { createPrismaClient } from "../src/prisma/create-prisma-client";
import { ensureKxE2eOrg, retireKxE2eOrg } from "./kx-e2e-org.seed";

async function main() {
  const prisma = createPrismaClient();
  try {
    const action = process.env.KX_E2E_ORG_ACTION;
    if (action === "ensure") await ensureKxE2eOrg(prisma, process.env.KX_E2E_ORG_OWNER_PASSWORD ?? "");
    else if (action === "retire") await retireKxE2eOrg(prisma);
    else throw new Error("KX_E2E_ORG_ACTION must be ensure or retire");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error("kx-e2e-org failed:", e instanceof Error ? e.message : e); process.exit(1); });
