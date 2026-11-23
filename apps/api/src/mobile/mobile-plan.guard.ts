import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { resolveJwtSigningSecret } from "../auth/jwt-secret.util";
import { MobileEntitlementService } from "./mobile-entitlement.service";
import { isMobilePlanGated, mobileFeatureDisabled, pathOf } from "./mobile.interceptor";

/**
 * Global guard (APP_GUARD runs BEFORE controller guards such as ScopeGuard / EntitlementGuard / SubscriptionAccessGuard): the plan gate
 * `mobile_staff_app` must answer 403 FEATURE_DISABLED before any role/scope/plan 403, so the app always routes a Lite user to the upgrade screen.
 * `req.user` is not set yet, so the bearer token is verified here (signature + expiry only); any invalid/missing token falls through and
 * JwtAuthGuard answers 401. Device binding and the same check (defence in depth) stay in MobileInterceptor.
 */
@Injectable()
export class MobilePlanGuard implements CanActivate {
  private readonly jwt: JwtService;
  constructor(config: ConfigService, private readonly ent: MobileEntitlementService) {
    this.jwt = new JwtService({ secret: resolveJwtSigningSecret(config) });
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== "http") return true;
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined>; originalUrl?: string; url?: string; method: string }>();
    const c = req.headers["x-kiorly-client"];
    const client = Array.isArray(c) ? c[0] : c;
    const p = pathOf({ originalUrl: req.originalUrl ?? req.url ?? "" });
    if (!isMobilePlanGated(req.method, p, client)) return true;
    const a = req.headers.authorization;
    const raw = Array.isArray(a) ? a[0] : a;
    if (!raw?.startsWith("Bearer ")) return true;
    let tenantId: string | null | undefined;
    try { tenantId = (this.jwt.verify(raw.slice(7)) as { tenantId?: string | null }).tenantId; } catch { return true; }
    if (!tenantId) return true;
    const e = await this.ent.evaluate(tenantId);
    if (!e.enabled) throw mobileFeatureDisabled(e);
    return true;
  }
}
