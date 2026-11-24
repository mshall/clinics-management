import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadDotenv } from "dotenv";
import { PrismaClient } from "@prisma/client";

// Prisma 7 no longer reads .env itself; scripts/seeds/tests started from apps/api rely on this (never overrides real env).
loadDotenv({ quiet: true });

/**
 * Pool size when `DATABASE_URL` has no `connection_limit`: `DB_POOL_MAX`, else 10 (the `pg` default, made explicit).
 * Prisma 6 used num_cpus*2+1 (21 on a 10-core Mac), so budget per process: the shared dev cluster has max_connections=100.
 */
export const DEFAULT_POOL_MAX = 10;
export function resolvePoolMax(connectionLimit: number): number {
  if (Number.isInteger(connectionLimit) && connectionLimit > 0) return connectionLimit;
  const env = Number(process.env.DB_POOL_MAX);
  return Number.isInteger(env) && env > 0 ? env : DEFAULT_POOL_MAX;
}

/**
 * How long a request waits for a free pooled connection before failing (-> 503 Retry-After, see db-pool-exhausted.filter.ts). `pool_timeout` in DATABASE_URL (seconds,
 * Prisma's name) wins, then `DB_POOL_TIMEOUT_MS`, else 10 s (what Prisma 6 waited).
 */
export const DEFAULT_POOL_TIMEOUT_MS = 10_000;
export function resolvePoolTimeoutMs(poolTimeoutSeconds: number): number {
  if (Number.isFinite(poolTimeoutSeconds) && poolTimeoutSeconds > 0) return Math.round(poolTimeoutSeconds * 1000);
  const env = Number(process.env.DB_POOL_TIMEOUT_MS);
  return Number.isInteger(env) && env > 0 ? env : DEFAULT_POOL_TIMEOUT_MS;
}

/** Prisma-only URL parameters that the `pg` driver does not understand. */
const PRISMA_ONLY_PARAMS = ["schema", "connection_limit", "pool_timeout", "connect_timeout", "pgbouncer"];

/**
 * Prisma 7 talks to Postgres through a driver adapter. This turns the Prisma-style `DATABASE_URL`
 * (`?schema=public&connection_limit=N&sslmode=...`) into a `PrismaPg` adapter: `schema` and
 * `connection_limit` become adapter options, everything else (e.g. `sslmode=no-verify`) is left for `pg`.
 */
export function createPrismaAdapter(databaseUrl: string | undefined = process.env.DATABASE_URL): PrismaPg {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get("schema") ?? undefined;
  const limit = Number(url.searchParams.get("connection_limit"));
  const poolTimeout = Number(url.searchParams.get("pool_timeout"));
  for (const p of PRISMA_ONLY_PARAMS) url.searchParams.delete(p);
  return new PrismaPg(
    {
      connectionString: url.toString(),
      max: resolvePoolMax(limit),
      // Prisma 6 waited up to 10 s for a pooled connection; `pg` waits forever by default.
      connectionTimeoutMillis: resolvePoolTimeoutMs(poolTimeout),
      // Return idle connections before a proxy / Postgres drops them silently (pg default 10 s churns connections under bursty load).
      idleTimeoutMillis: 30_000,
      keepAlive: true,
    },
    { ...(schema ? { schema } : {}), onPoolError: (e: Error) => console.error(`[db-pool] idle connection error: ${e.message}`), onConnectionError: (e: Error) => console.error(`[db-pool] connection error: ${e.message}`) },
  );
}

/** `new PrismaClient()` equivalent for scripts, seeds and tests (the Nest app uses `PrismaService`). */
export function createPrismaClient(options: Omit<ConstructorParameters<typeof PrismaClient>[0], "adapter"> = {}): PrismaClient {
  return new PrismaClient({ ...options, adapter: createPrismaAdapter() });
}
