import { createReadStream } from "fs";
import { pipeline } from "stream/promises";
import type { Response } from "express";
import type { OrgBackupArtifact } from "./org-backup.service";

/** Stream a READY export artifact with headers that avoid mid-transfer compression / proxy buffering issues. */
export async function streamOrgBackupArtifact(res: Response, file: OrgBackupArtifact): Promise<void> {
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Length", String(file.size));
  res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
  res.setHeader("Cache-Control", "private, no-store");
  // Prevent Express compression from rewriting Content-Length mid-stream (Chrome → "Failed - Network error").
  res.setHeader("Content-Encoding", "identity");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Hint reverse proxies (nginx) not to buffer large ZIP bodies.
  res.setHeader("X-Accel-Buffering", "no");

  const stream = createReadStream(file.artifactPath, { highWaterMark: 1024 * 1024 });
  res.on("close", () => {
    if (!stream.destroyed) stream.destroy();
  });
  try {
    await pipeline(stream, res);
  } catch {
    // Client disconnect / proxy abort after headers — avoid Nest unhandled rejection.
    if (!res.headersSent) {
      res.status(500).end();
    } else if (!res.writableEnded) {
      res.destroy();
    }
  }
}
