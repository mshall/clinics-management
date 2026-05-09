import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
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
    return this.reports.profitLoss(user.tenantId, from, to, user);
  }

  @Get("monthly-series")
  @ApiOperation({ summary: "Per-month visits (finalized encounters), posted revenue, and new patients" })
  @ApiOkResponse()
  monthlySeries(@CurrentUser() user: JwtUser, @Query("months") months?: string) {
    return this.reports.monthlySeries(user.tenantId, months, user);
  }
}
