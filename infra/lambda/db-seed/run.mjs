/**
 * VPC Lambda entry: load RDS credentials, run migrate deploy, repair enum values, then idempotent prisma seed.
 */
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { spawnSync } from "node:child_process";
import path from "node:path";

const apiRoot = process.env.API_ROOT ?? "/repo/apps/api";

function vpceHttpsFromHost(host) {
  if (!host || typeof host !== "string") return undefined;
  let h = host.trim();
  if (/^Z[a-z0-9]+:(?=vpce-)/i.test(h)) h = h.replace(/^Z[a-z0-9]+:/i, "");
  return h ? `https://${h}` : undefined;
}

async function buildDatabaseUrl() {
  const arn = process.env.DB_SECRET_ARN;
  if (!arn) throw new Error("DB_SECRET_ARN is required");
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "eu-central-1";
  const smEndpoint = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
  const kmsEndpoint = vpceHttpsFromHost(process.env.KMS_VPCE_HOST);
  if (kmsEndpoint) process.env.AWS_ENDPOINT_URL_KMS = kmsEndpoint;

  const client = new SecretsManagerClient({
    region,
    ...(smEndpoint ? { endpoint: smEndpoint } : {}),
  });
  const out = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const j = JSON.parse(out.SecretString ?? "{}");
  const u = encodeURIComponent(String(j.username ?? ""));
  const p = encodeURIComponent(String(j.password ?? ""));
  const host = j.host ?? j.hostname ?? j.endpoint;
  const dbPort = j.port ?? 5432;
  const dbname = j.dbname ?? j.database ?? "postgres";
  if (!host) throw new Error("DB secret JSON missing host");
  return `postgresql://${u}:${p}@${host}:${dbPort}/${dbname}?schema=public&sslmode=no-verify`;
}

function runSql(label, sql) {
  console.log(`[db-seed] ${label} …`);
  const result = spawnSync("npx", ["prisma", "db", "execute", "--stdin"], {
    encoding: "utf8",
    input: sql,
    env: process.env,
    cwd: apiRoot,
  });
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  if (result.error) {
    console.error(`${label} spawn error:`, result.error);
    return { ok: false, exit: 1, detail: result.error.message };
  }
  const exit = result.status ?? 1;
  if (exit !== 0) {
    return { ok: false, exit, detail: result.stderr?.slice(-2000) ?? `${label} failed` };
  }
  return { ok: true };
}

function repairEnumValues() {
  return runSql(
    "repair UserRole enum values on RDS",
    `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CLINIC_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CLINIC_ASSISTANT';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PLATFORM_SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CALL_CENTER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'GROUP_SUPERVISOR';
`,
  );
}

function runMigrateDeploy() {
  console.log("[db-seed] running prisma migrate deploy …");
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
    env: process.env,
    cwd: apiRoot,
  });
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  if (result.error) {
    console.error("migrate spawn error:", result.error);
    return { ok: false, exit: 1, detail: result.error.message };
  }
  const exit = result.status ?? 1;
  if (exit !== 0) {
    return { ok: false, exit, detail: result.stderr?.slice(-2000) ?? "migrate deploy failed" };
  }
  return { ok: true };
}

function runSeedScript() {
  const seedScript = path.join(apiRoot, "prisma", "seed.ts");
  const binDir = path.join(apiRoot, "..", "..", "node_modules", ".bin");
  const env = {
    ...process.env,
    PATH: `${binDir}:/usr/local/bin:${process.env.PATH ?? ""}`,
  };
  const result = spawnSync("npx", ["tsx", seedScript], {
    encoding: "utf8",
    env,
    cwd: apiRoot,
  });
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  if (result.error) {
    console.error("spawn error:", result.error);
    return { ok: false, exit: 1, detail: result.error.message };
  }
  const exit = result.status ?? 1;
  if (exit !== 0) {
    return { ok: false, exit, detail: result.stderr?.slice(-2000) ?? "seed exited non-zero" };
  }
  return { ok: true };
}

export const handler = async () => {
  console.log("[db-seed] loading DATABASE_URL from Secrets Manager …");
  process.env.DATABASE_URL = await buildDatabaseUrl();
  process.env.PRISMA_SEED_ENSURE_DEMO_PASSWORDS = process.env.PRISMA_SEED_ENSURE_DEMO_PASSWORDS ?? "true";
  const migrate = runMigrateDeploy();
  if (!migrate.ok) {
    console.error("[db-seed] migrate failed:", migrate.detail ?? migrate.exit);
    throw new Error(migrate.detail ?? "migrate deploy failed");
  }
  const repair = repairEnumValues();
  if (!repair.ok) {
    console.error("[db-seed] enum repair failed:", repair.detail ?? repair.exit);
    throw new Error(repair.detail ?? "enum repair failed");
  }
  console.log("[db-seed] running prisma seed …");
  const out = runSeedScript();
  if (!out.ok) {
    console.error("[db-seed] failed:", out.detail ?? out.exit);
    throw new Error(out.detail ?? "seed exited non-zero");
  }
  console.log("[db-seed] completed OK");
  return { ok: true };
};
