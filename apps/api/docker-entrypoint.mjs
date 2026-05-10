/**
 * Builds DATABASE_URL from RDS Secrets Manager JSON (host, port, username, password, dbname)
 * when DB_SECRET_ARN is set, optionally runs Prisma migrations, then starts the Nest app.
 */
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const dbSecretArn = process.env.DB_SECRET_ARN;
if (dbSecretArn) {
  const region =
    process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "eu-central-1";
  const client = new SecretsManagerClient({ region });
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
  console.error("[boot] PRISMA_MIGRATE_ON_BOOT=true — running prisma migrate deploy …");
  const cwd = __dirname;
  const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
    cwd,
  });
  if (migrate.status !== 0) {
    console.error("[boot] prisma migrate deploy failed with status", migrate.status);
    process.exit(migrate.status ?? 1);
  }
  console.error("[boot] prisma migrate deploy completed OK");
}

const mainJs = path.join(__dirname, "dist", "main.js");
console.error("[boot] spawning Nest", mainJs, "PORT=", process.env.PORT ?? "3000", "NODE_ENV=", process.env.NODE_ENV ?? "");
const child = spawn(process.execPath, [mainJs], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
