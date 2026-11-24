import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { effectiveRoles } from "../common/effective-roles";
import { FeatureGuard, RequiresFeature } from "../feature-flags/feature-flags-public";
import { CreditStatementService } from "./credit-statement.service";
import { CreditWalletService } from "./credit-wallet.service";
import { UsageBundleService } from "./usage-bundles/usage-bundle.service";

const READ_ROLES: UserRole[] = [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.FINANCE_OFFICER, UserRole.BRANCH_MANAGER];

/** Owner and finance read view of PROVIDER credit (GRW-P2-W). Read-only: grants come from the platform, spending from invoices. No patient data here. */
@ApiTags("credits")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, FeatureGuard)
@Controller("credits")
export class CreditsController {
  constructor(
    private readonly wallet: CreditWalletService,
    private readonly statements: CreditStatementService,
    private readonly bundles: UsageBundleService,
  ) {}

  private assertCanRead(user: JwtUser) {
    if (user.isTenantOwner || effectiveRoles(user).some((r) => READ_ROLES.includes(r))) return;
    throw new ForbiddenException("Only the owner and finance roles can read the credit wallet");
  }

  @RequiresFeature("clinic.provider_credit_v2")
  @Get("wallet")
  @ApiOperation({ summary: "Credit wallet: balance, lots by expiry and category, history, what the credit can pay for" })
  getWallet(@CurrentUser() user: JwtUser, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    this.assertCanRead(user);
    return this.wallet.getWalletView(requireTenantId(user), page ? Number(page) : undefined, pageSize ? Number(pageSize) : undefined);
  }

  @RequiresFeature("clinic.provider_credit_v2")
  @Get("statement/:period")
  @ApiOperation({ summary: "Credit section of the monthly statement (YYYY-MM): opening, grants, use by purpose, expiries, closing" })
  async statement(@CurrentUser() user: JwtUser, @Param("period") period: string) {
    this.assertCanRead(user);
    return (await this.statements.sectionForPeriod(requireTenantId(user), period)) ?? { periodKey: period, empty: true };
  }

  @Get("usage-bundles")
  @ApiOperation({ summary: "Usage bundle skeleton (flag clinic.usage_bundles, OFF by default)" })
  listBundles(@CurrentUser() user: JwtUser) {
    this.assertCanRead(user);
    return this.bundles.list(requireTenantId(user));
  }

  @Post("usage-bundles/:key/purchase")
  @ApiOperation({ summary: "Buy a usage bundle from credit (idempotent on Idempotency-Key)" })
  purchase(@CurrentUser() user: JwtUser, @Param("key") key: string, @Headers("idempotency-key") idem: string, @Body() _body?: unknown) {
    this.assertCanRead(user);
    return this.bundles.purchase(requireTenantId(user), key, idem ?? "", user.userId);
  }
}
