import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";

const MAX_ATTACHMENT_BYTES = 9 * 1024 * 1024;

/** CDK sets *HOST only (vpce-….vpce.amazonaws.com); SDK needs https URL. */
function vpceHttpsFromHost(host) {
  if (!host || typeof host !== "string") return undefined;
  let h = host.trim();
  if (/^Z[a-z0-9]+:(?=vpce-)/i.test(h)) h = h.replace(/^Z[a-z0-9]+:/i, "");
  return h ? `https://${h}` : undefined;
}

function chunkBase64(buf) {
  const b64 = buf.toString("base64");
  const lines = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

function buildRawEmail({ from, to, subject, text, attachmentName, attachmentBuffer }) {
  const boundary = `----=_Part_${randomBytes(8).toString("hex")}`;
  const parts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    text,
    "",
    `--${boundary}`,
    `Content-Type: application/gzip; name="${attachmentName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${attachmentName}"`,
    "",
    chunkBase64(attachmentBuffer),
    "",
    `--${boundary}--`,
    "",
  ];
  return Buffer.from(parts.join("\r\n"));
}

function runCommand(label, file, args, env) {
  try {
    execFileSync(file, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const e = err;
    const stderr = e.stderr?.toString?.() ?? "";
    const stdout = e.stdout?.toString?.() ?? "";
    throw new Error(
      `${label} failed (exit ${e.status ?? "?"}): ${e.message}${stderr ? `\nstderr: ${stderr.trim()}` : ""}${stdout ? `\nstdout: ${stdout.trim()}` : ""}`,
    );
  }
}

export const handler = async () => {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "eu-central-1";
  const to = process.env.BACKUP_EMAIL_TO;
  const from = process.env.BACKUP_EMAIL_FROM ?? to;
  const bucket = process.env.BACKUP_BUCKET;
  const secretArn = process.env.DB_SECRET_ARN;

  if (!to || !from || !bucket || !secretArn) {
    throw new Error("Missing BACKUP_EMAIL_TO, BACKUP_EMAIL_FROM, BACKUP_BUCKET, or DB_SECRET_ARN");
  }

  const smEndpoint = vpceHttpsFromHost(process.env.SECRETS_MANAGER_VPCE_HOST);
  const kmsEndpoint = vpceHttpsFromHost(process.env.KMS_VPCE_HOST);
  if (kmsEndpoint) process.env.AWS_ENDPOINT_URL_KMS = kmsEndpoint;

  console.log("Fetching DB credentials from Secrets Manager", { secretArn, smVpce: Boolean(smEndpoint), kmsVpce: Boolean(kmsEndpoint) });

  const sm = new SecretsManagerClient({
    region,
    ...(smEndpoint ? { endpoint: smEndpoint } : {}),
  });
  let secretOut;
  try {
    secretOut = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`GetSecretValue failed: ${msg}`);
  }
  const j = JSON.parse(secretOut.SecretString ?? "{}");
  const host = j.host ?? j.hostname ?? j.endpoint;
  const port = j.port ?? 5432;
  const username = j.username;
  const password = j.password;
  const dbname = j.dbname ?? j.database ?? "clinic";
  if (!host || !username || !password) {
    throw new Error("DB secret JSON missing host/username/password");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sqlPath = `/tmp/kiorly-backup-${stamp}.sql`;
  const gzPath = `${sqlPath}.gz`;
  const attachmentName = `kiorly-clinic-db-${stamp}.sql.gz`;

  try {
    console.log("Running pg_dump", { host, port, dbname, username });
    runCommand(
      "pg_dump",
      "pg_dump",
      [
        "-h",
        String(host),
        "-p",
        String(port),
        "-U",
        String(username),
        "-d",
        String(dbname),
        "--no-owner",
        "--no-acl",
        "-F",
        "p",
        "-f",
        sqlPath,
      ],
      {
        ...process.env,
        PGPASSWORD: String(password),
        // Match App Runner docker-entrypoint: RDS requires TLS; image has no RDS CA bundle.
        PGSSLMODE: process.env.PGSSLMODE ?? "no-verify",
      },
    );
    runCommand("gzip", "gzip", ["-f", sqlPath], process.env);

    const gzBuffer = readFileSync(gzPath);
    const s3Key = `pre-deploy/${attachmentName}`;
    console.log("Uploading backup to S3", { bucket, s3Key, bytes: gzBuffer.length });
    const s3 = new S3Client({ region });
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: gzBuffer,
          ContentType: "application/gzip",
          ServerSideEncryption: "AES256",
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`S3 PutObject failed: ${msg}`);
    }

    const sesEndpoint = vpceHttpsFromHost(process.env.SES_VPCE_HOST);
    const ses = new SESClient({
      region,
      ...(sesEndpoint ? { endpoint: sesEndpoint } : {}),
    });
    const subject = `Kiorly clinics DB backup ${stamp} (pre-deploy)`;
    let emailed = false;
    let emailError;

    try {
      if (gzBuffer.length <= MAX_ATTACHMENT_BYTES) {
        const raw = buildRawEmail({
          from,
          to,
          subject,
          text: [
            "Automated PostgreSQL backup taken before an AWS deployment.",
            "",
            `Database: ${dbname}`,
            `Host: ${host}`,
            `Size: ${(gzBuffer.length / 1024).toFixed(1)} KiB (gzip)`,
            "",
            "The dump is attached. Restore locally with:",
            `  gunzip -c ${attachmentName} | psql "$DATABASE_URL"`,
          ].join("\n"),
          attachmentName,
          attachmentBuffer: gzBuffer,
        });
        await ses.send(
          new SendRawEmailCommand({
            Source: from,
            Destinations: [to],
            RawMessage: { Data: raw },
          }),
        );
      } else {
        const downloadUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
          { expiresIn: 7 * 24 * 3600 },
        );
        await ses.send(
          new SendRawEmailCommand({
            Source: from,
            Destinations: [to],
            RawMessage: {
              Data: Buffer.from(
                [
                  `From: ${from}`,
                  `To: ${to}`,
                  `Subject: ${subject} (download link)`,
                  "MIME-Version: 1.0",
                  "Content-Type: text/plain; charset=UTF-8",
                  "",
                  "Automated PostgreSQL backup taken before an AWS deployment.",
                  "",
                  `Database: ${dbname}`,
                  `Host: ${host}`,
                  `Size: ${(gzBuffer.length / (1024 * 1024)).toFixed(2)} MiB (gzip) - too large for email attachment.`,
                  "",
                  "Download (valid 7 days):",
                  downloadUrl,
                  "",
                  `S3: s3://${bucket}/${s3Key}`,
                ].join("\r\n"),
              ),
            },
          }),
        );
      }
      emailed = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.warn("SES send failed after S3 backup was stored:", emailError);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        bytes: gzBuffer.length,
        s3Key,
        emailedTo: to,
        emailed,
        emailError,
        attached: emailed && gzBuffer.length <= MAX_ATTACHMENT_BYTES,
      }),
    };
  } finally {
    try {
      unlinkSync(gzPath);
    } catch {
      /* ignore */
    }
  }
};
