import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import { type SplitPaymentBody, SplitPaymentService } from "./split-payment.service";

/** MN-06 — split payments and installment schedules. */
@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement("mod_invoices")
@Controller("billing")
export class SplitPaymentsController {
  constructor(private readonly split: SplitPaymentService) {}

  @Post("split-payments")
  @ApiOperation({ summary: "Pay a visit balance, an operation (installments) or a service across several methods; one revenue row per method" })
  record(@CurrentUser() user: JwtUser, @Body() body: SplitPaymentBody) {
    return this.split.record(requireTenantId(user), user, body);
  }

  @Get("installments")
  @ApiOperation({ summary: "Installment schedule (status=OPEN|OVERDUE|DUE_SOON)" })
  installments(
    @CurrentUser() user: JwtUser,
    @Query("clinicId") clinicId?: string,
    @Query("operationId") operationId?: string,
    @Query("status") status?: string,
  ) {
    return this.split.listInstallments(requireTenantId(user), user, { clinicId, operationId, status });
  }

  @Put("operations/:operationId/installments")
  @ApiOperation({ summary: "Replace the unpaid installments of an operation" })
  setSchedule(@CurrentUser() user: JwtUser, @Param("operationId") operationId: string, @Body() body: { rows: { dueOn: string; amount: number }[] }) {
    return this.split.setSchedule(requireTenantId(user), user, operationId, body?.rows ?? []);
  }
}
