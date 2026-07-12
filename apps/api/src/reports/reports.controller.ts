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
  @ApiOperation({ summary: "Per-month visits, posted revenue, expenses, and new patients" })
  @ApiOkResponse()
  monthlySeries(@CurrentUser() user: JwtUser, @Query("months") months?: string) {
    return this.reports.monthlySeries(requireTenantId(user), months, user);
  }

  @Get("patient-acquisition/patients")
  @ApiOperation({ summary: "Paginated patients for one acquisition channel in a date range" })
  @ApiOkResponse()
  patientAcquisitionPatients(
    @CurrentUser() user: JwtUser,
    @Query("channel") channel?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("search") search?: string,
    @Query("mrn") mrn?: string,
    @Query("name") name?: string,
    @Query("phone") phone?: string,
    @Query("branch") branch?: string,
    @Query("detail") detail?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
  ) {
    return this.reports.patientAcquisitionPatients(requireTenantId(user), {
      channel: channel ?? "",
      from,
      to,
      search,
      mrn,
      name,
      phone,
      branch,
      detail,
      page,
      pageSize,
      sortBy,
      sortOrder,
    });
  }

  @Get("patient-acquisition")
  @ApiOperation({ summary: "New patient registrations grouped by acquisition channel (how they found us)" })
  @ApiOkResponse()
  patientAcquisition(@CurrentUser() user: JwtUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.patientAcquisitionBreakdown(requireTenantId(user), from, to);
  }
}
