import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { ReportsService } from "./reports.service";

@ApiTags("reports")
@ApiBearerAuth("bearer")
@Controller("reports")
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("profit-loss")
  @ApiOperation({ summary: "Monthly revenue, expenses, and net profit" })
  @ApiOkResponse()
  profitLoss(@CurrentUser() user: JwtUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.profitLoss(requireTenantId(user), from, to, user);
  }

  @Get("monthly-series")
  @ApiOperation({ summary: "Per-month visits (finalized encounters), posted revenue, and new patients" })
  @ApiOkResponse()
  monthlySeries(@CurrentUser() user: JwtUser, @Query("months") months?: string) {
    return this.reports.monthlySeries(requireTenantId(user), months, user);
  }

  @Get("patient-acquisition")
  @ApiOperation({ summary: "New patient registrations grouped by acquisition channel (how they found us)" })
  @ApiOkResponse()
  patientAcquisition(@CurrentUser() user: JwtUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.patientAcquisitionBreakdown(requireTenantId(user), from, to);
  }
}
