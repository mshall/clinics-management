import { Body, Controller, Delete, Get, Param, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import { type RuleBody, RevenueShareService } from "./revenue-share.service";
import { RevenueShareAddAdjustmentBodyDto, RevenueShareMarkPaidBodyDto } from "./revenue-share.controller.dto";

/** MN-02 — doctor revenue-share engine & statements. */
@ApiTags("revenue-share")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement("mod_revenue")
@Controller("revenue-share")
export class RevenueShareController {
  constructor(private readonly share: RevenueShareService) {}

  @Get("statements")
  @ApiOperation({ summary: "Doctor statements for a period (YYYY-MM); a doctor sees only their own" })
  statements(@CurrentUser() user: JwtUser, @Query("period") period?: string) {
    return this.share.statements(requireTenantId(user), user, period);
  }

  @Get("reconciliation")
  @ApiOperation({ summary: "Collected revenue for the period = doctor statements + unattributed rows" })
  reconciliation(@CurrentUser() user: JwtUser, @Query("period") period?: string) {
    return this.share.reconciliation(requireTenantId(user), user, period);
  }

  @Post("statements/:id/adjustments")
  addAdjustment(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: RevenueShareAddAdjustmentBodyDto) {
    return this.share.addAdjustment(requireTenantId(user), user, id, body);
  }

  @Post("statements/:id/approve")
  @ApiOperation({ summary: "Owner approves and locks a statement" })
  approve(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.share.approve(requireTenantId(user), user, id);
  }

  @Post("statements/:id/mark-paid")
  @ApiOperation({ summary: "Record the payout to the doctor (approved statements only)" })
  markPaid(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: RevenueShareMarkPaidBodyDto) {
    return this.share.markPaid(requireTenantId(user), user, id, body ?? {});
  }

  @Get("statements/:id/pdf")
  @ApiProduces("application/pdf")
  @ApiOperation({ summary: "Bilingual (EN + AR) statement PDF" })
  async pdf(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    const { pdf, filename } = await this.share.pdf(requireTenantId(user), user, id);
    return new StreamableFile(pdf, { type: "application/pdf", disposition: `attachment; filename="${filename}"` });
  }

  @Get("rules")
  listRules(@CurrentUser() user: JwtUser) {
    return this.share.listRules(requireTenantId(user), user);
  }

  @Post("rules")
  createRule(@CurrentUser() user: JwtUser, @Body() body: RuleBody) {
    return this.share.createRule(requireTenantId(user), user, body);
  }

  @Delete("rules/:id")
  deactivateRule(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.share.deactivateRule(requireTenantId(user), user, id);
  }
}
