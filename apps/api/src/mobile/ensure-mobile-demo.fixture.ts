import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

/**
 * Self-seeding for integration tests that need the mobile demo tenants (demo_t_na = PRO, demo_t_bs = BASIC, demo_t_nsolo = NURSE_PRO).
 * CI runs `db:seed:demo` + `db:seed:mobile`; a fresh local `kiorly_test` has neither, which made `mobile.integration` fail with "not found".
 * Both seeds are idempotent (deterministic ids), so calling this on an already seeded database is a cheap existence check.
 * The seeds run in a child process (they are scripts with their own Prisma client) with the same DATABASE_URL, and refuse production by themselves
 * (`assertDemoSeedAllowed`); KIORLY_ENV=test only declares what this process already is.
 */
export async function ensureMobileDemoTenants(prisma: PrismaClient): Promise<void> {
  const apiRoot = path.resolve(__dirname, "..", "..");
  const have = async (id: string) => (await prisma.tenant.count({ where: { id } })) > 0;
  const run = (script: string) => execFileSync(process.execPath, ["--import", "tsx", script], {
    cwd: apiRoot, stdio: "pipe", timeout: 240_000,
    env: { ...process.env, DEMO_SEED_ALLOWED: "true", KIORLY_ENV: process.env.KIORLY_ENV ?? "test" },
  });
  if (!(await have("demo_t_na")) || !(await have("demo_t_nsolo"))) run("prisma/demo/seed-demo.ts");
  if (!(await have("demo_t_bs"))) run("prisma/demo/seed-mobile.ts");
  if (!(await have("demo_t_na")) || !(await have("demo_t_bs")) || !(await have("demo_t_nsolo"))) throw new Error("mobile demo tenants are still missing after seeding");
}
