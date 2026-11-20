import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadDotenv } from "dotenv";
import { PrismaClient } from "@prisma/client";

// Prisma 7 no longer reads .env itself; scripts/seeds/tests started from apps/api rely on this (never overrides real env).
loadDotenv({ quiet: true });

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
  for (const p of PRISMA_ONLY_PARAMS) url.searchParams.delete(p);
  return new PrismaPg(
    {
      connectionString: url.toString(),
      ...(Number.isInteger(limit) && limit > 0 ? { max: limit } : {}),
      // Prisma 6 waited up to 10 s for a pooled connection; `pg` waits forever by default.
      connectionTimeoutMillis: 10_000,
    },
    schema ? { schema } : undefined,
  );
}

/** `new PrismaClient()` equivalent for scripts, seeds and tests (the Nest app uses `PrismaService`). */
export function createPrismaClient(options: Omit<ConstructorParameters<typeof PrismaClient>[0], "adapter"> = {}): PrismaClient {
  return new PrismaClient({ ...options, adapter: createPrismaAdapter() });
}
