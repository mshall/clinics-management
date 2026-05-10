import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma CLI config (migrate, db seed, studio). Replaces deprecated package.json#prisma.
 * Paths are relative to this file (apps/api).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
