import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JwtUser } from "../auth/jwt-user";
import { REQUIRES_SCOPE_KEY } from "./requires-scope.decorator";
import type { ScopeCapability } from "./scope-capabilities";
import { ScopeOfPracticeService } from "./scope-of-practice.service";

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly scope: ScopeOfPracticeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const capability = this.reflector.getAllAndOverride<ScopeCapability | undefined>(REQUIRES_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!capability) return true;
    const user = context.switchToHttp().getRequest<{ user?: JwtUser }>().user;
    if (!user?.userId) return true; // authentication is JwtAuthGuard's job; integration clients are not clinicians
    await this.scope.assertCan(user.userId, capability);
    return true;
  }
}
