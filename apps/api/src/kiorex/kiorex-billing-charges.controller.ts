import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CommissionChargeStatus } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { CommissionChargeService } from "./commission-charge.service";

@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("billing/kiorex")
export class KiorexBillingChargesController {
  constructor(private readonly charges: CommissionChargeService) {}

  @Get("charges")
  @ApiOperation({ summary: "List Kiorex commission charges for the organization" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("period") period?: string,
    @Query("status") status?: CommissionChargeStatus,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.charges.listForTenant(user, requireTenantId(user), {
      period,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post("charges/:id/dispute")
  @ApiOperation({ summary: "Open a dispute on a Kiorex commission charge before the deadline" })
  dispute(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: { note?: string }) {
    return this.charges.openDispute(user, requireTenantId(user), id, body?.note);
  }
}