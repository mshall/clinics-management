import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { IntegrationScope } from "@prisma/client";
import { INTEGRATION_SCOPES_KEY } from "./integration-auth.decorator";
import { IntegrationClientService } from "./integration-client.service";
import { parseIntegrationBearerToken } from "./integration-token";

@Injectable()
export class IntegrationAuthGuard implements CanActivate {
  constructor(
    private readonly clients: IntegrationClientService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      integrationClient?: Awaited<ReturnType<IntegrationClientService["authenticateBearer"]>>;
    }>();
    const auth = req.headers.authorization;
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const parsed = parseIntegrationBearerToken(bearer);
    if (!parsed) throw new UnauthorizedException("Invalid integration API token");

    const principal = await this.clients.authenticateBearer(parsed.clientKey, parsed.secret);
    req.integrationClient = principal;

    const required = this.reflector.getAllAndOverride<IntegrationScope[]>(INTEGRATION_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length) {
      const has = required.every((s) => principal.scopes.includes(s));
      if (!has) throw new ForbiddenException("Integration client lacks required scope");
    }
    return true;
  }
}
