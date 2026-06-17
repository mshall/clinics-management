/**
 * App Runner boot worker: secret → migrate → Nest on NEST_INTERNAL_PORT.
 * Liveness on PORT is handled by health-listener.mjs (PID 1).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function vpceHttpsFromHost(host) {
  if (!host || typeof host !== "string") return undefined;
  let h = host.trim();
  if (/^Z[a-z0-9]+:(?=vpce-)/i.test(h)) h = h.replace(/^Z[a-z0-9]+:/i, "");
  return h ? `https://${h}` : undefined;
}

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
    console.log(`[boot] prisma migrate deploy (attempt ${attempt}) …`);
    const exit = await runChild("prisma", ["migrate", "deploy"]);
    if (exit === 0) {
      console.log("[boot] prisma migrate deploy completed OK");
      return;
    }
    console.error("[boot] migrate failed with status", exit, "— retrying (health listener keeps /health/live)");
    await sleep(Math.min(30_000, 5000 * Math.min(attempt, 6)));
  }
}

async function loadDbSecretFromArn(dbSecretArn) {
  let attempt = 0;
  let secretsSdk;
  let client;
  while (true) {
    attempt++;
    try {
      if (!secretsSdk) {
        secretsSdk = await import("@aws-sdk/client-secrets-manager");
        const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "eu-central-1";
        const smEndpoint = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
        client = new secretsSdk.SecretsManagerClient({
          region,
          ...(smEndpoint ? { endpoint: smEndpoint } : {}),
        });
        if (smEndpoint) {
          console.log("[boot] Secrets Manager client using SECRETS_MANAGER_VPCE_HOST");
        }
      }
      const out = await client.send(new secretsSdk.GetSecretValueCommand({ SecretId: dbSecretArn }));
      const j = JSON.parse(out.SecretString ?? "{}");
      const u = encodeURIComponent(String(j.username ?? ""));
      const p = encodeURIComponent(String(j.password ?? ""));
      const host = j.host ?? j.hostname ?? j.endpoint;
      const dbPort = j.port ?? 5432;
      const dbname = j.dbname ?? j.database ?? "postgres";
      if (!host) throw new Error("DB secret JSON missing host");
      process.env.DATABASE_URL = `postgresql://${u}:${p}@${host}:${dbPort}/${dbname}?schema=public&sslmode=no-verify`;
      console.log("[boot] DATABASE_URL built (host/port/db):", host, String(dbPort), dbname);
      return;
    } catch (e) {
      console.error(`[boot] DB secret fetch attempt ${attempt} failed:`, e?.message ?? e);
      secretsSdk = undefined;
      client = undefined;
      await sleep(Math.min(30_000, 750 * 2 ** Math.min(attempt - 1, 6)));
    }
  }
}

async function main() {
  console.log("[boot] docker-boot.mjs starting");

  const internalPort = Number(process.env.NEST_INTERNAL_PORT ?? "3001");

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
    console.log("[boot] spawning Nest", mainJs, "PORT=", internalPort);
    const child = spawn(process.execPath, [mainJs], { stdio: "inherit", env: nestEnv });
    child.on("exit", (code, signal) => {
      if (code === 0 && !signal) {
        console.log("[boot] Nest exited cleanly");
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
  console.error("[boot] docker-boot fatal:", err);
});
