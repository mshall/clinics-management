import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { DunningService } from "./dunning.service";
import { REQUIRES_SUBSCRIPTION_ACCESS_KEY } from "./requires-subscription-access.decorator";
import type { SubscriptionAccessAction } from "./subscription-access-policy";

@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dunning: DunningService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<SubscriptionAccessAction | undefined>(
      REQUIRES_SUBSCRIPTION_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!action) return true;

    const req = context.switchToHttp().getRequest<{
      user?: JwtUser;
      integrationClient?: { tenantId: string };
    }>();
    const user = req.user;
    if (user && isPlatformSuperAdmin(user)) return true;

    const tenantId = user ? requireTenantId(user) : req.integrationClient?.tenantId;
    if (!tenantId) return false;

    await this.dunning.assertAccess(tenantId, user ?? null, action);
    return true;
  }
}