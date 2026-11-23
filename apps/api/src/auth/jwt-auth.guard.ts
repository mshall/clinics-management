import { ExecutionContext, Injectable, Optional } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { KiorexBearerService } from "./kiorex-bearer.service";

/** Product JWT (HS256, `jwt` strategy) or, for the staff mobile app, a Kiorex Passport access token (RS256) mapped to the linked Kiorly user. */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(@Optional() private readonly bearer?: KiorexBearerService) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.bearer) {
      const req = context.switchToHttp().getRequest<{ headers?: Record<string, string | undefined>; user?: unknown }>();
      const h = req.headers?.authorization;
      if (h?.startsWith("Bearer ")) {
        const token = h.slice(7);
        if (this.bearer.accepts(token)) {
          req.user = await this.bearer.authenticate(token);
          return true;
        }
      }
    }
    return (await super.canActivate(context)) as boolean;
  }
}
