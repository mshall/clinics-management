/**
 * Builds DATABASE_URL from RDS Secrets Manager JSON (host, port, username, password, dbname)
 * when DB_SECRET_ARN is set, optionally runs Prisma migrations, then starts the Nest app.
 */
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** CDK sets *HOST only (vpce-….vpce.amazonaws.com); SDK needs https URL. */
function vpceHttpsFromHost(host) {
  if (!host || typeof host !== "string") return undefined;
  let h = host.trim();
  // Defensive: DnsEntry "HostedZoneId:dnsName" if a deploy path ever passes the pair as host only.
  if (/^Z[a-z0-9]+:(?=vpce-)/i.test(h)) h = h.replace(/^Z[a-z0-9]+:/i, "");
  return h ? `https://${h}` : undefined;
}

const dbSecretArn = process.env.DB_SECRET_ARN;
if (dbSecretArn) {
  const region =
    process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "eu-central-1";
  const smEndpoint = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
  const client = new SecretsManagerClient({
    region,
    ...(smEndpoint ? { endpoint: smEndpoint } : {}),
  });
  if (smEndpoint) {
    console.error("[boot] Secrets Manager client using SECRETS_MANAGER_VPCE_HOST (VPC interface)");
  }
  const maxAttempts = Number(process.env.DB_SECRET_FETCH_ATTEMPTS ?? "8");
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const out = await client.send(new GetSecretValueCommand({ SecretId: dbSecretArn }));
      const j = JSON.parse(out.SecretString ?? "{}");
      const u = encodeURIComponent(String(j.username ?? ""));
      const p = encodeURIComponent(String(j.password ?? ""));
      const host = j.host ?? j.hostname ?? j.endpoint;
      const port = j.port ?? 5432;
      const dbname = j.dbname ?? j.database ?? "postgres";
      if (!host) {
        throw new Error("DB secret JSON missing host/hostname/endpoint");
      }
      // sslmode=no-verify: RDS may require TLS; slim images often lack RDS CA bundle (require would fail).
      process.env.DATABASE_URL = `postgresql://${u}:${p}@${host}:${port}/${dbname}?schema=public&sslmode=no-verify`;
      console.error("[boot] DATABASE_URL built (host/port/db):", host, String(port), dbname);
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      console.error(`DB secret fetch attempt ${attempt}/${maxAttempts} failed:`, e?.message ?? e);
      if (attempt < maxAttempts) {
        await sleep(Math.min(10_000, 750 * 2 ** (attempt - 1)));
      }
    }
  }
  if (lastErr && !process.env.DATABASE_URL) {
    console.error("Failed to load DB secret from Secrets Manager:", lastErr);
    process.exit(1);
  }
}

if (process.env.PRISMA_MIGRATE_ON_BOOT === "true") {
  // App Runner health-checks this path immediately; Nest is not listening until migrate finishes.
  // A short-lived HTTP server keeps checks passing during migrate deploy.
  const port = Number(process.env.PORT ?? "3000");
  const server = createServer((req, res) => {
    const p = req.url?.split("?")[0] ?? "";
    const live = req.method === "GET" && p === "/api/v1/health/live";
    res.statusCode = live ? 200 : 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(live ? { status: "ok" } : { status: "migrating" }));
  });

  await new Promise((resolve, reject) => {
    server.listen(port, "0.0.0.0", () => {
      console.error("[boot] migrate-time health probe listening on", port);
      resolve();
    });
    server.on("error", reject);
  });

  let migrateExit = 0;
  try {
    console.error("[boot] PRISMA_MIGRATE_ON_BOOT=true — running prisma migrate deploy …");
    const cwd = __dirname;
    const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: process.env,
      cwd,
    });
    migrateExit = migrate.status ?? 1;
    if (migrateExit !== 0) {
      console.error("[boot] prisma migrate deploy failed with status", migrateExit);
    } else {
      console.error("[boot] prisma migrate deploy completed OK");
    }
  } finally {
    await new Promise((resolve) => {
      server.close(() => {
        console.error("[boot] migrate-time health probe closed");
        resolve();
      });
    });
  }
  if (migrateExit !== 0) {
    process.exit(migrateExit);
  }
}

if (process.env.PRISMA_SEED_ON_BOOT === "true") {
  console.error("[boot] PRISMA_SEED_ON_BOOT=true — running seed script …");
  console.error("[boot] WARNING: demo seed deletes all tenants/clinics/users — never enable on AWS production.");
  const seedScript = path.join(__dirname, "prisma", "seed.ts");
  const seedResult = spawnSync("npx", ["tsx", seedScript], {
    stdio: "inherit",
    env: process.env,
    cwd: __dirname,
  });
  if ((seedResult.status ?? 1) !== 0) {
    console.error("[boot] seed script failed with status", seedResult.status, "— continuing anyway");
  } else {
    console.error("[boot] seed script completed OK");
  }
}

const kmsEp = vpceHttpsFromHost(process.env.KMS_VPCE_HOST);
const stsEp = vpceHttpsFromHost(process.env.STS_VPCE_HOST);
const smEpForChild = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
if (smEpForChild) process.env.AWS_ENDPOINT_URL_SECRETS_MANAGER = smEpForChild;
if (kmsEp) process.env.AWS_ENDPOINT_URL_KMS = kmsEp;
if (stsEp) process.env.AWS_ENDPOINT_URL_STS = stsEp;

const mainJs = path.join(__dirname, "dist", "main.js");
console.error("[boot] spawning Nest", mainJs, "PORT=", process.env.PORT ?? "3000", "NODE_ENV=", process.env.NODE_ENV ?? "");
const child = spawn(process.execPath, [mainJs], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
