import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JwtUser } from "../auth/jwt-user";
import { FeatureDisabledException } from "./feature-disabled.exception";
import { FeatureFlagsService } from "./feature-flags.service";
import { REQUIRES_FEATURE_KEY } from "./requires-feature.decorator";

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!key) return true;
    const req = context.switchToHttp().getRequest<{ user?: JwtUser; integrationClient?: { tenantId: string } }>();
    const tenantId = req.user?.tenantId ?? req.integrationClient?.tenantId ?? null;
    const res = await this.flags.evaluate(tenantId, key);
    // Plan entitlement (402) is raised by EntitlementGuard; flag guards only report flag-chain blocks.
    if (res.effective || res.source === "plan") return true;
    throw new FeatureDisabledException(key, res.scope ?? "global");
  }
}
