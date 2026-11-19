import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { NavTabAccessService } from "../user-nav-tabs/nav-tab-access.service";
import { REPORTS_VIEW_ROLES } from "../user-nav-tabs/nav-tab-module-roles";
import { ReportsService } from "./reports.service";

@ApiTags("reports")
@ApiBearerAuth("bearer")
@Controller("reports")
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement("mod_reports")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly navTabAccess: NavTabAccessService,
  ) {}

  private async assertView(user: JwtUser): Promise<void> {
    await this.navTabAccess.assertViewTab(user, "reports", REPORTS_VIEW_ROLES, "You do not have permission to view reports");
  }

  @Get("profit-loss")
  @ApiOperation({ summary: "Revenue, expenses, and net profit for a period (multi-currency)" })
  @ApiOkResponse()
  async profitLoss(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("clinicId") clinicId?: string,
  ) {
    await this.assertView(user);
    return this.reports.profitLoss(requireTenantId(user), from, to, clinicId, user);
  }

  @Get("performance")
  @ApiOperation({ summary: "Organization or clinic performance KPIs for a period" })
  @ApiOkResponse()
  async performance(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("clinicId") clinicId?: string,
  ) {
    await this.assertView(user);
    return this.reports.performanceSummary(requireTenantId(user), from, to, clinicId, user);
  }

  @Get("clinic-breakdown")
  @ApiOperation({ summary: "Per-clinic revenue, expenses, and operational metrics" })
  @ApiOkResponse()
  async clinicBreakdown(@CurrentUser() user: JwtUser, @Query("from") from?: string, @Query("to") to?: string) {
    await this.assertView(user);
    return this.reports.clinicBreakdown(requireTenantId(user), from, to, user);
  }

  @Get("monthly-series")
  @ApiOperation({ summary: "Per-month visits, posted revenue, expenses, and new patients (multi-currency)" })
  @ApiOkResponse()
  async monthlySeries(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("clinicId") clinicId?: string,
  ) {
    await this.assertView(user);
    return this.reports.monthlySeries(requireTenantId(user), from, to, clinicId, user);
  }

  @Get("patient-acquisition/patients")
  @ApiOperation({ summary: "Paginated patients for one acquisition channel in a date range" })
  @ApiOkResponse()
  async patientAcquisitionPatients(
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
    await this.assertView(user);
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
  async patientAcquisition(@CurrentUser() user: JwtUser, @Query("from") from?: string, @Query("to") to?: string) {
    await this.assertView(user);
    return this.reports.patientAcquisitionBreakdown(requireTenantId(user), from, to);
  }

  @Get("operations")
  @ApiOperation({ summary: "RP-01 operational KPIs: no-show, utilisation, revenue/hour, sources" })
  @ApiOkResponse()
  async operations(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("period") period?: string,
    @Query("clinicId") clinicId?: string,
  ) {
    await this.assertView(user);
    // `period=YYYY-MM` maps to that calendar month when from/to omitted.
    let fromEff = from;
    let toEff = to;
    if (!fromEff && !toEff && period?.match(/^\d{4}-\d{2}$/)) {
      const [y, m] = period.split("-").map(Number);
      fromEff = `${period}-01`;
      const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
      toEff = `${period}-${String(last).padStart(2, "0")}`;
    }
    return this.reports.operationsReport(requireTenantId(user), fromEff, toEff, clinicId, user);
  }
}