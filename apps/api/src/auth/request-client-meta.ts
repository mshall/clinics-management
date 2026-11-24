import type { Request } from "express";
import { createHash } from "crypto";
import type { LoginSessionMeta } from "./auth.service";
import { clientIpOf } from "../common/http-hardening";

export function clientIpFromRequest(req: Request): string | undefined {
  return clientIpOf(req); // TRUSTED_PROXY_HOPS-aware: a client-supplied X-Forwarded-For can no longer pick its own rate-limit bucket
}

export function loginMetaFromRequest(req: Request): LoginSessionMeta {
  const ip = clientIpFromRequest(req);
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
  return {
    userAgent,
    ipHash: ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : undefined,
  };
}