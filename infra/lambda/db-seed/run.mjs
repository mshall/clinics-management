/**
 * VPC Lambda entry: load RDS credentials, run idempotent prisma seed.
 */
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export async function handler() {
  process.env.DATABASE_URL = await buildDatabaseUrl();
  process.env.PRISMA_SEED_ENSURE_DEMO_PASSWORDS = process.env.PRISMA_SEED_ENSURE_DEMO_PASSWORDS ?? "true";
  const seedScript = path.join(__dirname, "prisma", "seed.ts");
  const result = spawnSync("npx", ["tsx", seedScript], {
    stdio: "inherit",
    env: process.env,
    cwd: __dirname,
  });
  const exit = result.status ?? 1;
  if (exit !== 0) {
    return { ok: false, exit };
  }
  return { ok: true };
}

handler()
  .then((out) => {
    if (!out.ok) process.exit(out.exit ?? 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
