/**
 * App Runner PID 1: bind PORT on 0.0.0.0 immediately (health probes succeed during
 * secret fetch / migrate), then Nest on NEST_INTERNAL_PORT with reverse proxy on PORT.
 */
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function createProxy(upstreamPort) {
  return createServer((req, res) => {
    if (isLiveProbe(req)) {
      respondLive(res, req);
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
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstreamReq.on("error", () => {
      if (res.headersSent) return;
      if (isLiveProbe(req)) {
        respondLive(res, req);
        return;
      }
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ status: "starting" }));
    });
    if (req.method === "GET" || req.method === "HEAD") upstreamReq.end();
    else req.pipe(upstreamReq);
  });
}

function runChild(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
      cwd: __dirname,
    });
    child.on("error", (err) => {
      console.error("[boot] spawn error:", command, err?.message ?? err);
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
    console.error("[boot] migrate failed with status", exit, "— retrying");
    await sleep(Math.min(30_000, 5000 * Math.min(attempt, 6)));
  }
}

async function loadDbSecretFromArn(dbSecretArn) {
  const { GetSecretValueCommand, SecretsManagerClient } = await import("@aws-sdk/client-secrets-manager");
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "eu-central-1";
      const smEndpoint = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
      const client = new SecretsManagerClient({
        region,
        ...(smEndpoint ? { endpoint: smEndpoint } : {}),
      });
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

async function bootWorker(internalPort) {
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
  const nestEnv = { ...process.env, PORT: String(internalPort), LISTEN_HOST: "127.0.0.1" };
  let nestRestarts = 0;

  function spawnNest() {
    console.error("[boot] spawning Nest", mainJs, "PORT=", internalPort);
    const child = spawn(process.execPath, [mainJs], { stdio: "inherit", env: nestEnv });
    child.on("exit", (code, signal) => {
      if (code === 0 && !signal) return;
      nestRestarts++;
      console.error("[boot] Nest exited code=", code, "signal=", signal, "restart=", nestRestarts);
      if (nestRestarts <= 5) setTimeout(spawnNest, 2000);
    });
  }

  spawnNest();
}

const publicPort = Number(process.env.PORT ?? "3000");
const internalPort = Number(process.env.NEST_INTERNAL_PORT ?? "3001");
const proxy = createProxy(internalPort);

proxy.listen(publicPort, "0.0.0.0", () => {
  process.stderr.write(`[boot] listening on ${publicPort}\n`);
  bootWorker(internalPort).catch((err) => {
    console.error("[boot] worker error (proxy stays on :3000):", err?.message ?? err);
  });
});

proxy.on("error", (err) => {
  console.error("[boot] proxy error (keeping process alive):", err?.message ?? err);
});
