import { createReadStream } from "fs";
import { pipeline } from "stream/promises";
import type { Request, Response } from "express";
import type { OrgBackupArtifact } from "./org-backup.service";

/**
 * Stream a READY export artifact.
 * Avoid Content-Encoding: identity (Chrome often reports "Failed - Network error" /
 * ERR_CONTENT_LENGTH_MISMATCH when that header is present with Content-Length).
 * Compression is skipped for these routes in main.ts instead.
 */
export async function streamOrgBackupArtifact(
  res: Response,
  file: OrgBackupArtifact,
  req?: Request,
): Promise<void> {
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Length", String(file.size));
  res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Hint reverse proxies (nginx / ALB) not to buffer large ZIP bodies.
  res.setHeader("X-Accel-Buffering", "no");
  // Keep the connection classified as a download for intermediaries.
  res.setHeader("Accept-Ranges", "none");

  const stream = createReadStream(file.artifactPath, {
    highWaterMark: 1024 * 1024,
    autoClose: true,
  });

  const abort = () => {
    if (!stream.destroyed) stream.destroy();
  };
  // Only tear down the file stream if the client abandons mid-transfer.
  req?.on("aborted", abort);
  res.on("close", () => {
    if (!res.writableEnded) abort();
  });

  try {
    await pipeline(stream, res);
  } catch {
    if (!res.headersSent) {
      res.status(500).end();
    } else if (!res.writableEnded) {
      res.destroy();
    }
  }
}
