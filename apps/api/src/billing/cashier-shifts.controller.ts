import { Body, Controller, Get, Param, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import { CashierShiftService } from "./cashier-shift.service";

/** MN-03 — cash drawer shifts. */
@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement("mod_invoices")
@Controller("billing/shifts")
export class CashierShiftsController {
  constructor(private readonly shifts: CashierShiftService) {}

  @Get("current")
  @ApiOperation({ summary: "Open shift for a clinic (blind — no expected amounts) and the last closed one" })
  current(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) {
    return this.shifts.current(requireTenantId(user), user, clinicId);
  }

  @Get()
  @ApiOperation({ summary: "Closed shifts; needsReview=true lists variances waiting for the owner" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("clinicId") clinicId?: string,
    @Query("needsReview") needsReview?: string,
    @Query("limit") limit?: string,
  ) {
    return this.shifts.list(requireTenantId(user), user, {
      clinicId: clinicId || undefined,
      needsReview: needsReview === "true",
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post("open")
  @ApiOperation({ summary: "Open the clinic drawer with a float" })
  open(@CurrentUser() user: JwtUser, @Body() body: { clinicId: string; openingFloat: number }) {
    return this.shifts.open(requireTenantId(user), user, body);
  }

  @Post(":id/close")
  @ApiOperation({ summary: "Blind count; any variance needs a note; above the market threshold flags review" })
  close(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: { countedCash: number; countedCard?: number; note?: string }) {
    return this.shifts.close(requireTenantId(user), user, id, body);
  }

  @Post(":id/review")
  @ApiOperation({ summary: "Owner / finance acknowledges a flagged variance" })
  review(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: { note?: string }) {
    return this.shifts.review(requireTenantId(user), user, id, body ?? {});
  }

  @Get(":id/z-report")
  @ApiProduces("application/pdf")
  @ApiOperation({ summary: "Bilingual Z-report PDF (format=a4|thermal)" })
  async zReport(@CurrentUser() user: JwtUser, @Param("id") id: string, @Query("format") format?: string) {
    const { pdf, filename } = await this.shifts.zReport(requireTenantId(user), user, id, format);
    return new StreamableFile(pdf, { type: "application/pdf", disposition: `inline; filename="${filename}"` });
  }
}
