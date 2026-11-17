import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { EntitlementsService } from "./entitlements.service";
import { REQUIRES_ENTITLEMENT_KEY } from "./requires-entitlement.decorator";

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const entitlement = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_ENTITLEMENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!entitlement) return true;

    const req = context.switchToHttp().getRequest<{
      user?: JwtUser;
      integrationClient?: { tenantId: string };
    }>();
    const user = req.user;
    const tenantId = user ? requireTenantId(user) : req.integrationClient?.tenantId;
    if (!tenantId) return false;
    await this.entitlements.requireEntitlement(tenantId, entitlement);
    return true;
  }
}