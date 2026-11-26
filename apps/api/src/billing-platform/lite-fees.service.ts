import { Injectable } from "@nestjs/common";
import { PlanKey } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { PrismaService } from "../prisma/prisma.service";
import { liteKiorexFeesFromSettlement, type LiteKiorexFeesSummary } from "./lite-fees";
import { parseBillingPeriod } from "./settlement-period";
import { SettlementService } from "./settlement.service";

function currentPeriodKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

@Injectable()
export class LiteFeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
  ) {}

  async getLiteFees(user: JwtUser, periodKey?: string): Promise<LiteKiorexFeesSummary> {
    const tenantId = requireTenantId(user);
    const key = (periodKey?.trim() || currentPeriodKey()).trim();
    parseBillingPeriod(key);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        baseCurrency: true,
        subscription: { select: { plan: { select: { key: true } }, planPrice: { select: { currency: true } } } },
      },
    });
    const currency = tenant?.subscription?.planPrice?.currency ?? tenant?.baseCurrency ?? "";
    const preview = await this.settlement.previewForTenant(user, tenantId, key);
    return liteKiorexFeesFromSettlement({
      periodKey: key,
      currency,
      isLite: tenant?.subscription?.plan.key === PlanKey.LITE,
      calculation: preview.calculation,
    });
  }
}
