/**
 * App Runner boot: bind :3000 on PID 1 immediately, then secret → migrate → Nest on NEST_INTERNAL_PORT.
 * Demo seed runs via post-deploy DbSeedFn Lambda (PRISMA_SEED_ON_BOOT=false).
 */
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

console.error("[boot] entrypoint loaded");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPort = Number(process.env.PORT ?? "3000");
const internalPort = Number(process.env.NEST_INTERNAL_PORT ?? "3001");

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
  return raw.replace(/\/+$/, "") || "/";
}

function isAppRunnerLiveProbe(req) {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") return false;
  const probePath = normalizeHealthPath(req.url);
  if (probePath === "/api/v1/health/live") return true;
  // App Runner may probe "/" on image/env updates even when HealthCheck Path is configured.
  if (probePath === "/" || probePath === "/health") return true;
  return false;
}

function respondBoot(res, req) {
  const live = isAppRunnerLiveProbe(req);
  res.statusCode = live ? 200 : 503;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(JSON.stringify(live ? { status: "ok", phase: "starting" } : { status: "starting" }));
}

function createUpstreamProxy(upstreamPort) {
  return createServer((req, res) => {
    if (isAppRunnerLiveProbe(req)) {
      respondBoot(res, req);
      return;
    }
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
    if (req.method === "GET" || req.method === "HEAD") upstreamReq.end();
    else req.pipe(upstreamReq);
  });
}

const proxy = createUpstreamProxy(internalPort);
const listenReady = new Promise((resolve, reject) => {
  proxy.listen(publicPort, "0.0.0.0", () => {
    console.error("[boot] boot proxy listening on", publicPort);
    resolve();
  });
  proxy.on("error", (err) => {
    console.error("[boot] boot proxy listen error:", err.message);
    reject(err);
  });
});

process.on("uncaughtException", (err) => {
  console.error("[boot] uncaughtException (keeping proxy up):", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[boot] unhandledRejection (keeping proxy up):", err);
});

function runChild(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
      cwd: __dirname,
    });
    child.on("error", (err) => {
      console.error("[boot] spawn error:", command, err.message);
      resolve(127);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function runMigrate() {
  let attempt = 0;
  while (true) {
    attempt++;
    console.error(`[boot] prisma migrate deploy (attempt ${attempt}) …`);
    const exit = await runChild("npx", ["prisma", "migrate", "deploy"]);
    if (exit === 0) {
      console.error("[boot] prisma migrate deploy completed OK");
      return;
    }
    console.error("[boot] migrate failed with status", exit, "— retrying (proxy keeps /health/live)");
    await sleep(Math.min(30_000, 5000 * Math.min(attempt, 6)));
  }
}

async function loadDbSecretFromArn(dbSecretArn) {
  const { GetSecretValueCommand, SecretsManagerClient } = await import("@aws-sdk/client-secrets-manager");
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "eu-central-1";
  const smEndpoint = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
  const client = new SecretsManagerClient({
    region,
    ...(smEndpoint ? { endpoint: smEndpoint } : {}),
  });
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const out = await client.send(new GetSecretValueCommand({ SecretId: dbSecretArn }));
      const j = JSON.parse(out.SecretString ?? "{}");
      const u = encodeURIComponent(String(j.username ?? ""));
      const p = encodeURIComponent(String(j.password ?? ""));
      const host = j.host ?? j.hostname ?? j.endpoint;
      const dbPort = j.port ?? 5432;
      const dbname = j.dbname ?? j.database ?? "postgres";
      if (!host) throw new Error("DB secret JSON missing host");
      process.env.DATABASE_URL = `postgresql://${u}:${p}@${host}:${dbPort}/${dbname}?schema=public&sslmode=no-verify`;
      console.error("[boot] DATABASE_URL built (host/port/db):", host, String(dbPort), dbname);
      return;
    } catch (e) {
      console.error(`[boot] DB secret fetch attempt ${attempt} failed:`, e?.message ?? e);
      await sleep(Math.min(30_000, 750 * 2 ** Math.min(attempt - 1, 6)));
    }
  }
}

async function main() {
  await listenReady;

  const kmsEp = vpceHttpsFromHost(process.env.KMS_VPCE_HOST);
  const stsEp = vpceHttpsFromHost(process.env.STS_VPCE_HOST);
  const smEp = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
  if (smEp) process.env.AWS_ENDPOINT_URL_SECRETS_MANAGER = smEp;
  if (kmsEp) process.env.AWS_ENDPOINT_URL_KMS = kmsEp;
  if (stsEp) process.env.AWS_ENDPOINT_URL_STS = stsEp;

  const dbSecretArn = process.env.DB_SECRET_ARN;
  if (dbSecretArn) await loadDbSecretFromArn(dbSecretArn);
  if (process.env.PRISMA_MIGRATE_ON_BOOT === "true") await runMigrate();

  const mainJs = path.join(__dirname, "dist", "main.js");
  const nestEnv = { ...process.env, PORT: String(internalPort) };
  let nestRestarts = 0;

  function spawnNest() {
    console.error("[boot] spawning Nest", mainJs, "PORT=", internalPort);
    const child = spawn(process.execPath, [mainJs], { stdio: "inherit", env: nestEnv });
    child.on("exit", (code, signal) => {
      if (code === 0 && !signal) {
        console.error("[boot] Nest exited cleanly — boot proxy keeps /health/live");
        return;
      }
      nestRestarts++;
      console.error("[boot] Nest exited code=", code, "signal=", signal, "restart=", nestRestarts);
      if (nestRestarts <= 5) setTimeout(spawnNest, 2000);
    });
  }

  spawnNest();
}

main().catch((err) => {
  console.error("[boot] fatal (boot proxy stays up if already listening):", err);
});
