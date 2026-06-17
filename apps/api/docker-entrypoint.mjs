/**
 * Builds DATABASE_URL from RDS Secrets Manager JSON when DB_SECRET_ARN is set,
 * runs Prisma migrate/seed, then starts Nest behind a port-3000 boot proxy.
 *
 * App Runner health-checks :3000 for the entire boot window. The proxy listens
 * on PORT first (no gap between migrate and Nest), answers /health/live while
 * migrate/seed/Nest warm up, and forwards all traffic once Nest is ready.
 */
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { spawn, spawnSync } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
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

async function listenServer(server, port, label) {
  await new Promise((resolve, reject) => {
    server.listen(port, "0.0.0.0", () => {
      console.error(`[boot] ${label} listening on`, port);
      resolve();
    });
    server.on("error", reject);
  });
}

function respondBoot(res, req) {
  const p = req.url?.split("?")[0] ?? "";
  const live = req.method === "GET" && p === "/api/v1/health/live";
  res.statusCode = live ? 200 : 503;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(live ? { status: "ok", phase: "starting" } : { status: "starting" }));
}

function createUpstreamProxy(upstreamPort) {
  return createServer((req, res) => {
    const upstreamReq = httpRequest(
      {
        hostname: "127.0.0.1",
        port: upstreamPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${upstreamPort}` },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstreamReq.on("error", () => respondBoot(res, req));
    req.pipe(upstreamReq);
  });
}

function runMigrateSync() {
  console.error("[boot] PRISMA_MIGRATE_ON_BOOT=true — running prisma migrate deploy …");
  const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
    cwd: __dirname,
  });
  const exit = migrate.status ?? 1;
  if (exit !== 0) {
    console.error("[boot] prisma migrate deploy failed with status", exit);
    process.exit(exit);
  }
  console.error("[boot] prisma migrate deploy completed OK");
}

function runSeedSync() {
  const seedScript = path.join(__dirname, "prisma", "seed.ts");
  console.error("[boot] PRISMA_SEED_ON_BOOT=true — running idempotent seed …");
  const seed = spawnSync("npx", ["tsx", seedScript], {
    stdio: "inherit",
    env: process.env,
    cwd: __dirname,
  });
  const exit = seed.status ?? 1;
  if (exit !== 0) {
    console.error("[boot] seed failed with status", exit, "— continuing to start API");
  } else {
    console.error("[boot] seed completed OK");
  }
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

const kmsEp = vpceHttpsFromHost(process.env.KMS_VPCE_HOST);
const stsEp = vpceHttpsFromHost(process.env.STS_VPCE_HOST);
const smEpForChild = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
if (smEpForChild) process.env.AWS_ENDPOINT_URL_SECRETS_MANAGER = smEpForChild;
if (kmsEp) process.env.AWS_ENDPOINT_URL_KMS = kmsEp;
if (stsEp) process.env.AWS_ENDPOINT_URL_STS = stsEp;

const proxy = createUpstreamProxy(internalPort);
await listenServer(proxy, publicPort, "upstream proxy");

if (migrateOnBoot) runMigrateSync();
if (seedOnBoot) runSeedSync();

const nestEnv = { ...process.env, PORT: String(internalPort) };
const mainJs = path.join(__dirname, "dist", "main.js");
console.error("[boot] spawning Nest", mainJs, "internal PORT=", internalPort);
const child = spawn(process.execPath, [mainJs], { stdio: "inherit", env: nestEnv });

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
