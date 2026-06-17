#!/usr/bin/env node
/** Quick local DB check: connection, demo user, password "demo". */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const demoEmail = "admin@drahmedshall.com";

try {
  await prisma.$connect();
  console.log("OK  PostgreSQL connection");

  const user = await prisma.user.findFirst({ where: { email: demoEmail } });
  if (!user) {
    console.error(`FAIL  No user ${demoEmail} — run: npm run db:setup`);
    process.exit(1);
  }
  console.log(`OK  Found ${demoEmail} (tenant ${user.tenantId ?? "platform"})`);

  let ok = false;
  try {
    ok = bcrypt.compareSync("demo", user.passwordHash);
  } catch {
    ok = false;
  }
  if (!ok) {
    console.error('FAIL  Password is not "demo" — run: npm run db:setup');
    process.exit(1);
  }
  console.log('OK  Password "demo" works');

  let apiOk = false;
  try {
    const res = await fetch("http://localhost:3000/api/v1/health/live");
    apiOk = res.ok;
  } catch {
    apiOk = false;
  }
  if (!apiOk) {
    console.error("FAIL  API not listening on http://localhost:3000");
    console.error("     From the repo root run: npm run dev");
    process.exit(1);
  }
  console.log("OK  API listening on http://localhost:3000");
  console.log("\nLogin: http://localhost:5173/login  (admin@drahmedshall.com / demo)");
} catch (err) {
  console.error("FAIL  Database error:", err instanceof Error ? err.message : err);
  console.error("\nFix:");
  console.error("  1. npm run db:up          # start Postgres (Docker)");
  console.error("  2. Set apps/api/.env DATABASE_URL=postgresql://cms:cms@localhost:5432/cms?schema=public");
  console.error("  3. npm run db:setup       # migrate + seed");
  console.error("  4. npm run dev");
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
