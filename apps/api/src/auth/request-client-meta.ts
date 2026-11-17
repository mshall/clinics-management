import type { Request } from "express";
import { createHash } from "crypto";
import type { LoginSessionMeta } from "./auth.service";

export function clientIpFromRequest(req: Request): string | undefined {
  return (
    (typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
      : undefined) || req.socket.remoteAddress
  );
}

export function loginMetaFromRequest(req: Request): LoginSessionMeta {
  const ip = clientIpFromRequest(req);
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
  return {
    userAgent,
    ipHash: ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : undefined,
  };
}