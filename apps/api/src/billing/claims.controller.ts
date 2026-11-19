import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ClaimBatchStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import { FeatureGuard, RequiresFeature } from "../feature-flags/feature-flags-public";
import { ClaimsService } from "./claims.service";

/** MN-05 — company contracts & TPA claims. */
@ApiTags("claims")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, EntitlementGuard, FeatureGuard)
@RequiresEntitlement("mod_invoices")
@Controller("claims")
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Get("payers")
  @ApiOperation({ summary: "Active payer companies for the tenant" })
  listPayers(@CurrentUser() user: JwtUser) {
    return this.claims.listPayers(requireTenantId(user));
  }

  @RequiresFeature("clinic.payers_tpa")
  @Post("payers")
  @ApiOperation({ summary: "Create or update a payer company" })
  upsertPayer(
    @CurrentUser() user: JwtUser,
    @Body() body: { id?: string; nameEn: string; nameAr?: string; contractRef?: string; active?: boolean },
  ) {
    return this.claims.upsertPayer(requireTenantId(user), user, body);
  }

  @Get("batches")
  @ApiOperation({ summary: "Claim batches" })
  listBatches(
    @CurrentUser() user: JwtUser,
    @Query("payerCompanyId") payerCompanyId?: string,
    @Query("status") status?: ClaimBatchStatus,
  ) {
    return this.claims.listBatches(requireTenantId(user), { payerCompanyId, status });
  }

  @Get("batches/:id")
  @ApiOperation({ summary: "Claim batch detail with lines and remittances" })
  getBatch(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.claims.getBatch(requireTenantId(user), id);
  }

  @RequiresFeature("clinic.payers_tpa")
  @Post("batches")
  @ApiOperation({ summary: "Create a draft claim batch from payer invoices in a period" })
  createBatch(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      payerCompanyId: string;
      periodFrom: string;
      periodTo: string;
      currency?: string;
      invoiceIds?: string[];
    },
  ) {
    return this.claims.createBatch(requireTenantId(user), user, body);
  }

  @Post("batches/:id/submit")
  @ApiOperation({ summary: "Submit batch + queue the payer claim invoice outbox (no tax-authority reporting)" })
  submitBatch(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.claims.submitBatch(requireTenantId(user), user, id);
  }

  @Post("lines/:id/reject")
  @ApiOperation({ summary: "Reject a claim line with a reason" })
  rejectLine(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: { reason: string }) {
    return this.claims.rejectLine(requireTenantId(user), user, id, body.reason);
  }

  @Post("lines/:id/resubmit")
  @ApiOperation({ summary: "Resubmit a rejected claim line" })
  resubmitLine(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.claims.resubmitLine(requireTenantId(user), user, id);
  }

  @Post("remittances")
  @ApiOperation({ summary: "Import a remittance and auto-match claim lines" })
  importRemittance(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      payerCompanyId: string;
      batchId?: string;
      reference: string;
      currency?: string;
      lines: { externalRef: string; amount: number }[];
    },
  ) {
    return this.claims.importRemittance(requireTenantId(user), user, body);
  }
}
