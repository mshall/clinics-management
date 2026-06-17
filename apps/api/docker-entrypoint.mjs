/**
 * Builds DATABASE_URL from RDS Secrets Manager JSON (host, port, username, password, dbname)
 * when DB_SECRET_ARN is set, optionally runs Prisma migrations, then starts the Nest app.
 *
 * App Runner health-checks :3000 immediately. Nest cold start can take 20–40s, so we keep a
 * lightweight proxy on PORT (3000) and run Nest on NEST_INTERNAL_PORT (3001) until upstream is ready.
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
  if (/^Z[a-z0-9]+:(?=vpce-)/i.test(h)) h = h.replace(/^Z[a-z0-9]+:/i, "");
  return h ? `https://${h}` : undefined;
}

function createBootHealthServer(port) {
  return createServer((req, res) => {
    const p = req.url?.split("?")[0] ?? "";
    const live = req.method === "GET" && p === "/api/v1/health/live";
    res.statusCode = live ? 200 : 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(live ? { status: "ok", phase: "boot" } : { status: "starting" }));
  });
}

async function listenServer(server, port, label) {
  await new Promise((resolve, reject) => {
    server.listen(port, "0.0.0.0", () => {
      console.error(`[boot] ${label} listening on`, port);
      resolve();
    });
    server.on("error", reject);
  });
}

function runSeedInBackground() {
  const seedScript = path.join(__dirname, "prisma", "seed.ts");
  console.error("[boot] PRISMA_SEED_ON_BOOT=true — scheduling idempotent seed in background …");
  const child = spawn("npx", ["tsx", seedScript], {
    stdio: "inherit",
    env: process.env,
    cwd: __dirname,
    detached: true,
  });
  child.unref();
}

function createUpstreamProxy(publicPort, upstreamPort) {
  return createServer((req, res) => {
    const target = `http://127.0.0.1:${upstreamPort}${req.url ?? "/"}`;
    fetch(target, { method: req.method, headers: req.headers }).then(async (upstream) => {
      res.statusCode = upstream.status;
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === "transfer-encoding") return;
        res.setHeader(key, value);
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      res.end(body);
    }).catch(() => {
      const p = req.url?.split("?")[0] ?? "";
      const live = req.method === "GET" && p === "/api/v1/health/live";
      if (live) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ status: "ok", phase: "starting" }));
        return;
      }
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ status: "starting" }));
    });
  });
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
      const dbPort = j.port ?? 5432;
      const dbname = j.dbname ?? j.database ?? "postgres";
      if (!host) {
        throw new Error("DB secret JSON missing host/hostname/endpoint");
      }
      process.env.DATABASE_URL = `postgresql://${u}:${p}@${host}:${dbPort}/${dbname}?schema=public&sslmode=no-verify`;
      console.error("[boot] DATABASE_URL built (host/port/db):", host, String(dbPort), dbname);
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

const publicPort = Number(process.env.PORT ?? "3000");
const internalPort = Number(process.env.NEST_INTERNAL_PORT ?? "3001");
const migrateOnBoot = process.env.PRISMA_MIGRATE_ON_BOOT === "true";
const seedOnBoot = process.env.PRISMA_SEED_ON_BOOT === "true";

if (migrateOnBoot) {
  const bootHealthServer = createBootHealthServer(publicPort);
  await listenServer(bootHealthServer, publicPort, "migrate-time health probe");
  console.error("[boot] PRISMA_MIGRATE_ON_BOOT=true — running prisma migrate deploy …");
  const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
    cwd: __dirname,
  });
  const migrateExit = migrate.status ?? 1;
  await new Promise((resolve) => bootHealthServer.close(() => resolve()));
  if (migrateExit !== 0) {
    console.error("[boot] prisma migrate deploy failed with status", migrateExit);
    process.exit(migrateExit);
  }
  console.error("[boot] prisma migrate deploy completed OK");
}

const kmsEp = vpceHttpsFromHost(process.env.KMS_VPCE_HOST);
const stsEp = vpceHttpsFromHost(process.env.STS_VPCE_HOST);
const smEpForChild = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
if (smEpForChild) process.env.AWS_ENDPOINT_URL_SECRETS_MANAGER = smEpForChild;
if (kmsEp) process.env.AWS_ENDPOINT_URL_KMS = kmsEp;
if (stsEp) process.env.AWS_ENDPOINT_URL_STS = stsEp;

const proxy = createUpstreamProxy(publicPort, internalPort);
await listenServer(proxy, publicPort, "upstream proxy");

const nestEnv = { ...process.env, PORT: String(internalPort) };
const mainJs = path.join(__dirname, "dist", "main.js");
console.error("[boot] spawning Nest", mainJs, "internal PORT=", internalPort);
const child = spawn(process.execPath, [mainJs], { stdio: "inherit", env: nestEnv });

if (seedOnBoot) {
  let seeded = false;
  const seedTimer = setInterval(() => {
    fetch(`http://127.0.0.1:${internalPort}/api/v1/health/live`)
      .then((res) => {
        if (res.ok && !seeded) {
          seeded = true;
          clearInterval(seedTimer);
          runSeedInBackground();
        }
      })
      .catch(() => {});
  }, 2000);
}

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
