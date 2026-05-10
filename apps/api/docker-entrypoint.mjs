/**
 * Builds DATABASE_URL from RDS Secrets Manager JSON (host, port, username, password, dbname)
 * when DB_SECRET_ARN is set, optionally runs Prisma migrations, then starts the Nest app.
 */
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbSecretArn = process.env.DB_SECRET_ARN;
if (dbSecretArn) {
  const region =
    process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "eu-central-1";
  const client = new SecretsManagerClient({ region });
  try {
    const out = await client.send(new GetSecretValueCommand({ SecretId: dbSecretArn }));
    const j = JSON.parse(out.SecretString ?? "{}");
    const u = encodeURIComponent(String(j.username ?? ""));
    const p = encodeURIComponent(String(j.password ?? ""));
    const host = j.host ?? j.hostname;
    const port = j.port ?? 5432;
    const dbname = j.dbname ?? j.database ?? "postgres";
    // sslmode=no-verify: RDS may require TLS; slim images often lack RDS CA bundle (require would fail).
    process.env.DATABASE_URL = `postgresql://${u}:${p}@${host}:${port}/${dbname}?schema=public&sslmode=no-verify`;
  } catch (e) {
    console.error("Failed to load DB secret from Secrets Manager:", e);
    process.exit(1);
  }
}

if (process.env.PRISMA_MIGRATE_ON_BOOT === "true") {
  const cwd = __dirname;
  const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
    cwd,
  });
  if (migrate.status !== 0) {
    process.exit(migrate.status ?? 1);
  }
}

const mainJs = path.join(__dirname, "dist", "main.js");
const child = spawn(process.execPath, [mainJs], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
