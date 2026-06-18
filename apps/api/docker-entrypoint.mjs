/**
 * App Runner boot: bind PORT immediately (before secret/migrate), then Nest on PORT.
 */
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? "3000");

process.stderr.write(`[boot] entrypoint pid=${process.pid}\n`);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function vpceHttpsFromHost(host) {
  if (!host || typeof host !== "string") return undefined;
  let h = host.trim();
  if (/^Z[a-z0-9]+:(?=vpce-)/i.test(h)) h = h.replace(/^Z[a-z0-9]+:/i, "");
  return h ? `https://${h}` : undefined;
}

function normalizeHealthPath(url) {
  const raw = url?.split("?")[0] ?? "";
  if (raw === "/api/v1/health/live" || raw === "/api/v1/health/live/") return "/api/v1/health/live";
  if (raw === "/health/live" || raw === "/health/live/") return "/health/live";
  return raw.replace(/\/+$/, "") || "/";
}

function isLiveProbe(req) {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") return false;
  const probePath = normalizeHealthPath(req.url);
  if (probePath === "/api/v1/health/live" || probePath === "/health/live") return true;
  if (probePath === "/" || probePath === "/health") return true;
  return false;
}

function respondLive(res, req) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(JSON.stringify({ status: "ok" }));
}

function createBootHealthServer() {
  return createServer((req, res) => {
    if (isLiveProbe(req)) {
      respondLive(res, req);
      return;
    }
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "starting" }));
  });
}

async function listenHealthServer(server) {
  await new Promise((resolve, reject) => {
    server.listen(port, "0.0.0.0", () => {
      process.stderr.write(`[boot] health listener on ${port}\n`);
      resolve();
    });
    server.on("error", reject);
  });
}

async function closeHealthServer(server) {
  await new Promise((resolve) => {
    server.close(() => resolve());
  });
}

const bootHealthServer = createBootHealthServer();
await listenHealthServer(bootHealthServer);

const dbSecretArn = process.env.DB_SECRET_ARN;
if (dbSecretArn) {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "eu-central-1";
  const smEndpoint = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
  const client = new SecretsManagerClient({
    region,
    ...(smEndpoint ? { endpoint: smEndpoint } : {}),
  });
  const maxAttempts = Number(process.env.DB_SECRET_FETCH_ATTEMPTS ?? "12");
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const out = await client.send(new GetSecretValueCommand({ SecretId: dbSecretArn }));
      const j = JSON.parse(out.SecretString ?? "{}");
      const u = encodeURIComponent(String(j.username ?? ""));
      const p = encodeURIComponent(String(j.password ?? ""));
      const host = j.host ?? j.hostname ?? j.endpoint;
      const dbPort = j.port ?? 5432;
      const dbname = j.dbname ?? j.database ?? "postgres";
      if (!host) throw new Error("DB secret JSON missing host/hostname/endpoint");
      process.env.DATABASE_URL = `postgresql://${u}:${p}@${host}:${dbPort}/${dbname}?schema=public&sslmode=no-verify`;
      console.error("[boot] DATABASE_URL built (host/port/db):", host, String(dbPort), dbname);
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      console.error(`[boot] DB secret fetch attempt ${attempt}/${maxAttempts} failed:`, e?.message ?? e);
      if (attempt < maxAttempts) {
        await sleep(Math.min(10_000, 750 * 2 ** (attempt - 1)));
      }
    }
  }
  if (lastErr && !process.env.DATABASE_URL) {
    console.error("[boot] Failed to load DB secret from Secrets Manager:", lastErr);
    process.exit(1);
  }
}

if (process.env.PRISMA_MIGRATE_ON_BOOT === "true") {
  let migrateExit = 0;
  try {
    console.error("[boot] PRISMA_MIGRATE_ON_BOOT=true — running prisma migrate deploy …");
    const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: process.env,
      cwd: __dirname,
    });
    migrateExit = migrate.status ?? 1;
    if (migrateExit !== 0) {
      console.error("[boot] prisma migrate deploy failed with status", migrateExit);
    } else {
      console.error("[boot] prisma migrate deploy completed OK");
    }
  } finally {
    /* health listener stays up through migrate */
  }
  if (migrateExit !== 0) {
    process.exit(migrateExit);
  }
}

if (process.env.PRISMA_SEED_ON_BOOT === "true") {
  console.error("[boot] PRISMA_SEED_ON_BOOT=true — running seed script …");
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

await closeHealthServer(bootHealthServer);
console.error("[boot] boot health listener closed — starting Nest");

const mainJs = path.join(__dirname, "dist", "main.js");
console.error("[boot] spawning Nest", mainJs, "PORT=", port);
const child = spawn(process.execPath, [mainJs], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => {
  console.error("[boot] Nest exited code=", code, "signal=", signal);
  process.exit(code ?? (signal ? 1 : 0));
});
