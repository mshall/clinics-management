/**
 * Q10 Part B: guard for every DEMO seed entrypoint (local `tsx`, compiled `node dist-seed/...`, and the staging seed Lambda).
 * Copy of the same file lives in every Kiorex v2 repo; change all copies together (each repo tests it).
 *
 * A demo seed runs ONLY when
 *   1. DEMO_SEED_ALLOWED=true, and
 *   2. the deployment environment is declared non-production. The environment comes from KIORLY_ENV (or KIOREX_ENV / ENV_TAG, the `Env` tag
 *      value that OpenTofu sets on the stack); NODE_ENV is only a fallback, because container images run with NODE_ENV=production in staging too.
 * It FAILS CLOSED: any variable that says prod/production, an unknown environment name, an undeclared environment with NODE_ENV=production,
 * or a DATABASE_URL that looks like a production database all refuse. Never prints secrets (the banner shows the environment and DB name only).
 */
export type SeedEnv = Record<string, string | undefined>;

const ENV_VARS = ["KIORLY_ENV", "KIOREX_ENV", "ENV_TAG"] as const;
const PROD_NAMES = new Set(["prod", "production", "prd", "live"]);
const NON_PROD_NAMES = new Set(["dev", "development", "local", "test", "testing", "staging", "stage", "demo", "qa", "sandbox", "preview"]);

export class DemoSeedRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Refusing to run the demo seed: ${reason}`);
    this.name = "DemoSeedRefusedError";
  }
}

/** The declared deployment environment (lower-case), or null when nothing declares one. Throws when two variables disagree on prod. */
export function declaredEnvironment(env: SeedEnv = process.env): string | null {
  const values = ENV_VARS.map((k) => env[k]?.trim().toLowerCase()).filter((v): v is string => Boolean(v));
  const prod = values.find((v) => PROD_NAMES.has(v));
  if (prod) return prod;
  return values[0] ?? null;
}

function databaseLooksProduction(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const hay = `${u.hostname} ${u.pathname.replace(/^\//, "")}`.toLowerCase();
    if (/(^|[^a-z0-9])(prod|production|prd)([^a-z0-9]|$)/.test(hay)) return u.pathname.replace(/^\//, "") || u.hostname;
  } catch {
    /* unparsable URL: the seed itself will fail on it */
  }
  return null;
}

/** Pure check (no logging): returns the environment name it accepted or throws DemoSeedRefusedError. */
export function checkDemoSeedAllowed(env: SeedEnv = process.env): string {
  if (env.DEMO_SEED_ALLOWED !== "true") throw new DemoSeedRefusedError("DEMO_SEED_ALLOWED=true is not set");
  const declared = declaredEnvironment(env);
  if (declared && PROD_NAMES.has(declared)) throw new DemoSeedRefusedError(`environment is "${declared}" (production)`);
  if (env.ALLOW_PRODUCTION_DEMO_SEED || env.ALLOW_DEMO_SEED === "prod") throw new DemoSeedRefusedError("there is no override that allows demo data in production");
  if (declared === null) {
    if ((env.NODE_ENV ?? "").toLowerCase() === "production") throw new DemoSeedRefusedError("NODE_ENV=production and no KIORLY_ENV/ENV_TAG declares a non-production environment");
  } else if (!NON_PROD_NAMES.has(declared)) {
    throw new DemoSeedRefusedError(`unknown environment "${declared}" (allowed: ${[...NON_PROD_NAMES].join(", ")})`);
  }
  const db = databaseLooksProduction(env.DATABASE_URL);
  if (db) throw new DemoSeedRefusedError(`DATABASE_URL points at a database that looks like production ("${db}")`);
  return declared ?? (env.NODE_ENV?.toLowerCase() || "local");
}

/** Call first in every demo seed `main()`: validates, then logs a banner (environment + database name only, never credentials). */
export function assertDemoSeedAllowed(label: string, env: SeedEnv = process.env, log: (m: string) => void = (m) => console.log(m)): string {
  const environment = checkDemoSeedAllowed(env);
  let dbName = "(DATABASE_URL not set)";
  try {
    if (env.DATABASE_URL) dbName = new URL(env.DATABASE_URL).pathname.replace(/^\//, "") || "(default)";
  } catch {
    dbName = "(unparsable)";
  }
  log(`==================================================================\n  DEMO SEED (synthetic, NON-PRODUCTION ONLY): ${label}\n  environment=${environment} database=${dbName}\n==================================================================`);
  return environment;
}
