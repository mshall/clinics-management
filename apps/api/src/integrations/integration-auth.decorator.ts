import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { IntegrationScope } from "@prisma/client";
import type { IntegrationPrincipal } from "./integration.types";

export const INTEGRATION_SCOPES_KEY = "integrationScopes";

export const RequireIntegrationScopes = (...scopes: IntegrationScope[]) =>
  SetMetadata(INTEGRATION_SCOPES_KEY, scopes);

export const IntegrationClient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IntegrationPrincipal => {
    const req = ctx.switchToHttp().getRequest<{ integrationClient: IntegrationPrincipal }>();
    return req.integrationClient;
  },
);
