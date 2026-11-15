import { Controller, Get, ForbiddenException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { resolveMarketForTenant } from "./market-resolver";
import { resolveTenantTransferCollectionContext } from "./market-transfer-context";
import { getFiscalProvider } from "../providers/fiscal/fiscal-provider.registry";

@ApiTags("markets")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("markets")
export class TenantMarketController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  @Get("current")
  @ApiOperation({ summary: "Resolved market pack for the signed-in organization" })
  @ApiOkResponse({ description: "Market currency, timezone, and payment methods for the tenant" })
  async current(@CurrentUser() user: JwtUser) {
    if (!user.tenantId) throw new ForbiddenException("Organization context required");
    const ctx = await resolveMarketForTenant(this.prisma, user.tenantId);
    const transfer = await resolveTenantTransferCollectionContext(this.prisma, this.featureFlags, user.tenantId);
    const fiscalProvider = getFiscalProvider(ctx.fiscalProviderKey);
    return {
      marketId: ctx.market.id,
      marketCode: ctx.market.code,
      currency: ctx.currency,
      timezone: ctx.timezone,
      weekendDays: ctx.weekendDays,
      fiscalProviderKey: ctx.fiscalProviderKey,
      fiscalDeviceRegistration: fiscalProvider?.deviceRegistration ?? null,
      paymentMethods: transfer.paymentMethods,
      organizationPaymentChannels: transfer.organizationPaymentChannels,
      transferChannels: [...transfer.allowedTransferChannels],
    };
  }
}