import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";

export const MarketplaceClient = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): PlatformIntegrationPrincipal => {
    const req = ctx.switchToHttp().getRequest<{ marketplaceClient?: PlatformIntegrationPrincipal }>();
    return req.marketplaceClient!;
  },
);