import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from "jose";
import { AuditService } from "../audit/audit.service";
import { jwtUserFromRow } from "../common/effective-roles";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtUser } from "./jwt-user";

/**
 * Kiorex Passport access tokens as bearer credentials (the Kiorly staff mobile app signs in at Passport with PKCE and sends the
 * access token to the product API; the web keeps its own session after the confidential-client callback).
 *
 * Identity only: the Passport `sub` maps to a Kiorly user through KiorexIdentityLink; role, tenant and permissions always come
 * from our own user row. First Passport login by verified phone matches exactly one active staff member (Employee.phone) and
 * links them (audited). No match / ambiguous match / unverified phone: refused (`PASSPORT_NOT_LINKED`), never auto-created.
 *
 * Enabled when KIOREX_OIDC_ISSUER is set and KIOREX_OIDC_ACCEPT_BEARER is not "false" (production: only when "true" or AUTH_MODE=oidc).
 */
export type BearerConfig = { issuer: string; jwksUrl: string; audiences: string[]; allowedClients: string[]; phoneLink: boolean };

const list = (v: string | undefined, d: string[]) => (v?.trim() ? v.split(",").map((s) => s.trim()).filter(Boolean) : d);

export function readBearerConfig(env: NodeJS.ProcessEnv = process.env): BearerConfig | null {
  const issuer = env.KIOREX_OIDC_ISSUER?.trim().replace(/\/+$/, "");
  if (!issuer) return null;
  const prod = env.NODE_ENV === "production";
  const flag = env.KIOREX_OIDC_ACCEPT_BEARER;
  if (prod ? !(flag === "true" || env.AUTH_MODE === "oidc") : flag === "false") return null;
  return {
    issuer,
    jwksUrl: env.KIOREX_OIDC_JWKS_URL?.trim() || `${issuer}/jwks`,
    audiences: list(env.KIOREX_OIDC_BEARER_AUDIENCE, ["kiorex-api", "kiorly-clinic"]),
    allowedClients: list(env.KIOREX_OIDC_BEARER_CLIENTS, ["kiorly", "kiorly-team"]),
    phoneLink: env.KIOREX_OIDC_PHONE_LINK ? env.KIOREX_OIDC_PHONE_LINK === "true" : !prod,
  };
}

export function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const s = p.replace(/[\s\-().]/g, "").replace(/^00/, "+");
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

type Claims = JWTPayload & { phone_number?: string; phone_number_verified?: boolean; client_id?: string; acr?: string; amr?: string[] };
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

@Injectable()
export class KiorexBearerService {
  private readonly log = new Logger(KiorexBearerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** True for an RS256 (Passport) token while bearer acceptance is on; product tokens are HS256 and keep using the existing strategy. */
  accepts(token: string): boolean {
    if (!readBearerConfig()) return false;
    try { return decodeProtectedHeader(token).alg === "RS256"; } catch { return false; }
  }

  async authenticate(token: string): Promise<JwtUser> {
    const cfg = readBearerConfig();
    if (!cfg) throw new UnauthorizedException();
    let claims: Claims;
    try {
      let jwks = jwksCache.get(cfg.jwksUrl);
      if (!jwks) { jwks = createRemoteJWKSet(new URL(cfg.jwksUrl)); jwksCache.set(cfg.jwksUrl, jwks); }
      const { payload } = await jwtVerify(token, jwks, { algorithms: ["RS256"], issuer: cfg.issuer, audience: cfg.audiences });
      claims = payload as Claims;
      if (!claims.sub || !claims.client_id || !cfg.allowedClients.includes(claims.client_id)) throw new Error("client not allowed");
    } catch (e) {
      this.log.debug(`Passport bearer rejected: ${e instanceof Error ? e.message : String(e)}`);
      throw new UnauthorizedException();
    }
    const userId = await this.resolveUserId(cfg, claims);
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null, deactivatedAt: null } });
    if (!user) throw new UnauthorizedException();
    // SC-04: a Passport session alone never replaces the second factor of a user who has one enrolled
    const mfa = claims.acr === "urn:kiorex:acr:mfa" || (Array.isArray(claims.amr) && claims.amr.includes("mfa"));
    if (user.mfaEnabled && !mfa) throw new UnauthorizedException({ message: "Second factor required", errorCode: "MFA_REQUIRED" });
    return jwtUserFromRow({ id: user.id, tenantId: user.tenantId, email: user.email, role: user.role, additionalRoles: user.additionalRoles, isTenantOwner: user.isTenantOwner });
  }

  private async resolveUserId(cfg: BearerConfig, claims: Claims): Promise<string> {
    const issuer = cfg.issuer;
    const link = await this.prisma.kiorexIdentityLink.findUnique({ where: { issuer_subject: { issuer, subject: claims.sub! } } });
    if (link) return link.userId;
    const phone = claims.phone_number_verified === true ? normalizePhone(claims.phone_number) : null;
    if (cfg.phoneLink && phone) {
      // the HR screens store Employee.phone as digits only (no "+"), seeds and imports may keep E.164: match both spellings of the same number
      const employees = await this.prisma.employee.findMany({
        where: { phone: { in: [phone, phone.slice(1)] }, deletedAt: null, userId: { not: null }, user: { deletedAt: null, deactivatedAt: null, tenantId: { not: null }, kiorexIdentityLink: null } },
        select: { userId: true, user: { select: { tenantId: true } } },
        take: 2,
      });
      if (employees.length === 1) {
        const { userId, user } = employees[0]!;
        await this.prisma.kiorexIdentityLink.create({ data: { userId: userId!, issuer, subject: claims.sub!, linkedVia: "PHONE_MATCH", phoneVerified: true } });
        if (user?.tenantId) {
          await this.audit.recordEvent({ tenantId: user.tenantId, actorId: userId!, clinicId: null, action: "KIOREX_IDENTITY_LINKED", resource: "Auth", resourceId: userId!, metadata: { subject: claims.sub, linkedVia: "PHONE_MATCH" } });
        }
        return userId!;
      }
    }
    throw new UnauthorizedException({ message: "This Kiorex Passport is not linked to a Kiorly staff account", errorCode: "PASSPORT_NOT_LINKED" });
  }
}
