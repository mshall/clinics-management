import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { PaymentMethod } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import { KiorexDepositsService } from "./kiorex-deposits.service";
import {
  PatientMoneyService,
  type CreateRefundBody,
  type SellPackageBody,
  type TakeDepositBody,
} from "./patient-money.service";

/** MN-01 — refunds, credit notes, prepaid packages and deposits (Pro+). */
@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement("mod_invoices")
@Controller()
export class PatientMoneyController {
  constructor(
    private readonly money: PatientMoneyService,
    private readonly kiorex: KiorexDepositsService,
  ) {}

  @Post("billing/refunds")
  @ApiOperation({ summary: "Refund collected revenue or a payment (approval above the market threshold)" })
  createRefund(@CurrentUser() user: JwtUser, @Body() body: CreateRefundBody) {
    return this.money.createRefund(requireTenantId(user), user, body);
  }

  @Get("billing/refunds")
  listRefunds(@CurrentUser() user: JwtUser, @Query("status") status?: string, @Query("clinicId") clinicId?: string) {
    return this.money.listRefunds(requireTenantId(user), user, status, clinicId);
  }

  @Post("billing/refunds/:id/approve")
  approveRefund(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: { note?: string }) {
    return this.money.decideRefund(requireTenantId(user), user, id, "approve", body?.note);
  }

  @Post("billing/refunds/:id/reject")
  rejectRefund(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: { note?: string }) {
    return this.money.decideRefund(requireTenantId(user), user, id, "reject", body?.note);
  }

  @Post("billing/packages")
  @ApiOperation({ summary: "Sell a prepaid package of N sessions (liability until consumed)" })
  sellPackage(@CurrentUser() user: JwtUser, @Body() body: SellPackageBody) {
    return this.money.sellPackage(requireTenantId(user), user, body);
  }

  @Post("billing/packages/:id/consume")
  consumePackage(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: { appointmentId?: string | null }) {
    return this.money.consumePackage(requireTenantId(user), user, id, body ?? {});
  }

  @Post("billing/packages/:id/cancel")
  cancelPackage(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: { reason: string; method?: PaymentMethod },
  ) {
    return this.money.cancelPackage(requireTenantId(user), user, id, body);
  }

  @Post("billing/deposits")
  @ApiOperation({ summary: "Take a deposit (held as a liability until applied or released)" })
  takeDeposit(@CurrentUser() user: JwtUser, @Body() body: TakeDepositBody) {
    return this.money.takeDeposit(requireTenantId(user), user, body);
  }

  @Post("billing/deposits/:id/apply")
  applyDeposit(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: { appointmentId?: string | null }) {
    return this.money.applyDeposit(requireTenantId(user), user, id, body ?? {});
  }

  @Post("billing/deposits/:id/release")
  releaseDeposit(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: { reason: string; outcome?: "RELEASED" | "FORFEITED" },
  ) {
    return this.money.releaseDeposit(requireTenantId(user), user, id, body);
  }

  @Get("billing/kiorex-payouts")
  @ApiOperation({ summary: "Deposits collected by Kiorex vs payouts received by the clinic (KX-07)" })
  kiorexPayouts(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("clinicId") clinicId?: string,
  ) {
    return this.kiorex.payoutReport(requireTenantId(user), user, { from, to, clinicId });
  }

  @Get("patients/:id/balances")
  @ApiOperation({ summary: "Deposits held, package balances, refunds and credit notes for a patient" })
  balances(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.money.patientBalances(requireTenantId(user), user, id);
  }
}
