import { Controller, Get, Header, Param, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { CommissionCollectionsService, EXPORT_VIEWS, type ExportView } from "./commission-collections.service";
import { BadRequestException } from "@nestjs/common";

/** COM-1: Admin > Billing > Kiorex commissions. Tenant comes from the token only; finance (and owner / group admin, and administrators when enabled) can read; exports are audited. */
@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("billing/kiorex-commissions")
export class CommissionCollectionsController {
  constructor(private readonly svc: CommissionCollectionsService) {}

  @Get("access") @ApiOperation({ summary: "May the signed-in user see Kiorex commission figures" })
  async access(@CurrentUser() user: JwtUser) { return { canView: await this.svc.access(user, requireTenantId(user)) }; }
  @Get("summary") @ApiOperation({ summary: "Totals: charges by status, collected, kept from payouts, invoiced, paid, open" })
  summary(@CurrentUser() user: JwtUser, @Query("period") period?: string) { return this.svc.summary(user, requireTenantId(user), period); }
  @Get("ledger") @ApiOperation({ summary: "Commission charges with the decision, fee basis and collection status that explain each" })
  ledger(@CurrentUser() user: JwtUser, @Query("period") period?: string, @Query("status") status?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) { return this.svc.ledger(user, requireTenantId(user), { period, status, page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined }); }
  @Get("collections") @ApiOperation({ summary: "Kiorex collection runs for the organization" })
  collections(@CurrentUser() user: JwtUser) { return this.svc.collections(user, requireTenantId(user)); }
  @Get("collections/:id") @ApiOperation({ summary: "One collection run: claims, attempts, status timeline, balance check" })
  collection(@CurrentUser() user: JwtUser, @Param("id") id: string) { return this.svc.collection(user, requireTenantId(user), id); }
  @Get("deductions") @ApiOperation({ summary: "Payouts that carry a commission deduction" })
  deductions(@CurrentUser() user: JwtUser) { return this.svc.deductions(user, requireTenantId(user)); }
  @Get("disputes") @ApiOperation({ summary: "Commission disputes (CR-08) with status" })
  disputes(@CurrentUser() user: JwtUser) { return this.svc.disputes(user, requireTenantId(user)); }
  @Get("rate") @ApiOperation({ summary: "COM-2: the organization's effective commission rate, the default, any override and the history (read only; set by Kiorex)" })
  rate(@CurrentUser() user: JwtUser) { return this.svc.rate(user, requireTenantId(user)); }
  @Get("charges/:id/timeline") @ApiOperation({ summary: "Status timeline of one charge" })
  timeline(@CurrentUser() user: JwtUser, @Param("id") id: string) { return this.svc.chargeTimeline(user, requireTenantId(user), id); }

  @Get("export/:view.csv") @Header("content-type", "text/csv; charset=utf-8") @ApiOperation({ summary: "CSV export (audited)" })
  async csv(@CurrentUser() user: JwtUser, @Param("view") view: string, @Query("period") period?: string) {
    if (!(EXPORT_VIEWS as readonly string[]).includes(view)) throw new BadRequestException("Unknown export view");
    const r = await this.svc.exportCsv(user, requireTenantId(user), view as ExportView, period);
    return new StreamableFile(Buffer.from(r.body, "utf8"), { type: "text/csv; charset=utf-8", disposition: `attachment; filename="${r.filename}"` });
  }
  @Get("statement/:period.pdf") @ApiOperation({ summary: "Bilingual statement PDF for a month (audited)" })
  async pdf(@CurrentUser() user: JwtUser, @Param("period") period: string) {
    const r = await this.svc.statementPdf(user, requireTenantId(user), period);
    return new StreamableFile(r.pdf, { type: "application/pdf", disposition: `attachment; filename="${r.filename}"` });
  }
}
