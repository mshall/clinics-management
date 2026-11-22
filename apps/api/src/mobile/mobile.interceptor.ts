import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Observable } from "rxjs";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { MOBILE_ENTITLEMENT_KEY, MobileEntitlementService } from "./mobile-entitlement.service";
import { sha256 } from "./mobile.service";

type Req = { user?: JwtUser; headers: Record<string, string | string[] | undefined>; originalUrl: string; method: string };
export const pathOf = (req: Pick<Req, "originalUrl">) => req.originalUrl.split("?")[0].replace(/^\/api\/v1/, "").replace(/\/+$/, "");

/** Routes open on EVERY plan: /auth/*, GET /mobile/bootstrap, /mobile/alerts* (ADR-025 safety inbox), POST /mobile/upgrade-request (a Basic org must be able to ask), DELETE /mobile/devices/:id (remote sign-out). */
export function isMobileExempt(method: string, p: string): boolean {
  if (p.startsWith("/auth/") || p === "/auth") return true;
  if (method === "POST" && p === "/mobile/upgrade-request") return true;
  if (p === "/mobile/bootstrap" || p === "/mobile/alerts" || p.startsWith("/mobile/alerts/")) return true;
  return method === "DELETE" && /^\/mobile\/devices\/[^/]+$/.test(p);
}

/** True for every /mobile/* route and every request identifying as the app (X-Kiorly-Client: kiorly-team/...), minus the plan-exempt routes. */
export function isMobilePlanGated(method: string, p: string, client: string | undefined): boolean {
  return Boolean((client && /^kiorly-team(\/|$)/.test(client)) || p.startsWith("/mobile/")) && !isMobileExempt(method, p);
}

/** Throws the 403 FEATURE_DISABLED body of the app's upgrade screen. */
export function mobileFeatureDisabled(e: { reason: string | null }): ForbiddenException {
  return new ForbiddenException({ statusCode: 403, code: "FEATURE_DISABLED", key: MOBILE_ENTITLEMENT_KEY, scope: "org", reason: e.reason, message: "The Kiorly Team staff app is not included in this plan.", messageAr: "تطبيق Kiorly Team للموظفين غير متاح في هذه الباقة." });
}

/**
 * Global interceptor (runs after the controller guards, so `req.user` is set; the plan gate itself runs earlier in MobilePlanGuard so FEATURE_DISABLED beats any role/scope/plan guard 403). 1) Device binding: X-Kiorly-Device + X-Kiorly-Device-Token must
 * match an ACTIVE device of the caller, else 401 DEVICE_REVOKED. 2) Entitlement `mobile_staff_app`: every /mobile/* route and every request that
 * identifies as the app (X-Kiorly-Client: kiorly-team/...) needs it, except the exempt routes. Both are no-ops for non-mobile traffic.
 */
@Injectable()
export class MobileInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService, private readonly ent: MobileEntitlementService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (ctx.getType() !== "http") return next.handle();
    const req = ctx.switchToHttp().getRequest<Req>();
    const user = req.user;
    if (!user?.userId || !user.tenantId) return next.handle();
    const h = (n: string) => { const v = req.headers[n]; return Array.isArray(v) ? v[0] : v; };
    const devId = h("x-kiorly-device"), devToken = h("x-kiorly-device-token");
    if (devId || devToken) {
      const dev = devId && devToken ? await this.prisma.mobileDevice.findFirst({ where: { tenantId: user.tenantId, userId: user.userId, OR: [{ id: devId }, { deviceId: devId }] } }) : null;
      const a = Buffer.from(dev?.tokenHash ?? ""), b = Buffer.from(sha256(devToken ?? ""));
      if (!dev || dev.status !== "ACTIVE" || a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException({ code: "DEVICE_REVOKED", message: "This device was signed out" });
      if (!dev.lastSeenAt || Date.now() - dev.lastSeenAt.getTime() > 60_000) await this.prisma.mobileDevice.update({ where: { id: dev.id }, data: { lastSeenAt: new Date() } });
    }
    const p = pathOf(req);
    if (isMobilePlanGated(req.method, p, h("x-kiorly-client"))) {
      const e = await this.ent.evaluate(user.tenantId);
      if (!e.enabled) throw mobileFeatureDisabled(e);
    }
    return next.handle();
  }
}
