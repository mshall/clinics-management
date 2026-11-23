import { createHash } from "node:crypto";
import sharp from "sharp";

/** Decoded raw RGBA hash — used to prove KEEP path did not change pixels. */
export async function rasterSha256(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf, { failOn: "none" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return createHash("sha256").update(data).digest("hex");
}

export function bytesSha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
