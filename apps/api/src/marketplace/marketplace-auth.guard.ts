import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import {
  MARKETPLACE_HMAC_MAX_SKEW_MS,
  marketplaceCanonicalString,
  sha256BodyHex,
  verifyMarketplaceSignature,
} from "./marketplace-hmac";
import { PlatformIntegrationClientService } from "./platform-integration-client.service";

const HEADER_KEY = "x-kiorly-client-key";
const HEADER_SECRET = "x-kiorly-client-secret";
const HEADER_TIMESTAMP = "x-kiorly-timestamp";
const HEADER_NONCE = "x-kiorly-nonce";
const HEADER_SIGNATURE = "x-kiorly-signature";

@Injectable()
export class MarketplaceAuthGuard implements CanActivate {
  constructor(private readonly clients: PlatformIntegrationClientService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<
      Request & { rawBody?: Buffer; marketplaceClient?: Awaited<ReturnType<PlatformIntegrationClientService["authenticate"]>> }
    >();
    const clientKey = readHeader(req, HEADER_KEY);
    const secret = readHeader(req, HEADER_SECRET);
    const timestamp = readHeader(req, HEADER_TIMESTAMP);
    const nonce = readHeader(req, HEADER_NONCE);
    const signature = readHeader(req, HEADER_SIGNATURE);
    if (!clientKey || !secret || !timestamp || !nonce || !signature) {
      throw new UnauthorizedException("Missing marketplace auth headers");
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MARKETPLACE_HMAC_MAX_SKEW_MS) {
      throw new UnauthorizedException("Stale marketplace timestamp");
    }

    const principal = await this.clients.authenticate(clientKey, secret);
    if (!principal.scopes.includes("MARKETPLACE")) {
      throw new ForbiddenException("MARKETPLACE scope required");
    }
    this.clients.assertNonce(principal.id, nonce);
    this.clients.assertIpAllowed(principal, req.ip);

    const body = req.rawBody ?? (req.body ? Buffer.from(JSON.stringify(req.body)) : undefined);
    const canonical = marketplaceCanonicalString({
      timestamp,
      nonce,
      method: req.method,
      path: req.originalUrl.split("?")[0] ?? req.url,
      bodySha256: sha256BodyHex(body),
    });
    if (!verifyMarketplaceSignature(secret, canonical, signature)) {
      throw new UnauthorizedException("Invalid marketplace signature");
    }

    req.marketplaceClient = principal;
    return true;
  }
}

function readHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value[0]?.trim();
  return undefined;
}