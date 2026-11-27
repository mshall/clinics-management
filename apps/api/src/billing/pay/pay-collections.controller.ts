import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Res, StreamableFile, UseGuards, BadRequestException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsIn, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";
import type { Response } from "express";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { FeatureGuard, RequiresFeature } from "../../feature-flags/feature-flags-public";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { JwtUser } from "../../auth/jwt-user";
import { Lenient } from "../../common/lenient-dto";
import { PayCollectionsService } from "./pay-collections.service";

@Lenient() export class PayIpnUploadBodyDto { @IsString() @MaxLength(8_000_000) content!: string; @IsOptional() @IsIn(["csv", "json"]) format?: "csv" | "json"; @IsOptional() @IsString() filename?: string }
@Lenient() export class PayMatchConfirmBodyDto { @IsString() invoiceId!: string }
@Lenient() export class PayMatchRejectBodyDto { @IsOptional() @IsString() @MaxLength(300) note?: string }
@Lenient() export class PayPrepareBodyDto { @IsString() invoiceId!: string; @IsIn(["CASH", "CARD", "TRANSFER", "WALLET"]) method!: "CASH" | "CARD" | "TRANSFER" | "WALLET" }
@Lenient() export class PayLinkCreateBodyDto { @IsIn(["CLINIC_INVOICE", "HOME_VISIT", "FRONT_DESK"]) context!: "CLINIC_INVOICE" | "HOME_VISIT" | "FRONT_DESK"; @IsString() subjectId!: string; @IsString() clinicId!: string; @IsOptional() @IsString() invoiceId?: string; @IsOptional() @IsNumber() amount?: number; @IsOptional() @IsNumber() ttlSec?: number }

@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, FeatureGuard)
@RequiresFeature("clinic.pay_collections")
@Controller("billing/pay")
export class PayCollectionsController {
  constructor(private readonly svc: PayCollectionsService) {}
  @Post("matching/ipn") @HttpCode(200) ipn(@CurrentUser() u: JwtUser, @Body() b: PayIpnUploadBodyDto) { return this.svc.ingestIpn(u, b); }
  @Get("matching/queue") queue(@CurrentUser() u: JwtUser, @Query("status") status?: string) { return this.svc.queueView(u, status); }
  @Get("matching/summary") summary(@CurrentUser() u: JwtUser) { return this.svc.matchSummary(u); }
  @Get("matching/invoices") invoices(@CurrentUser() u: JwtUser, @Query("q") q = "") { return this.svc.invoiceCandidates(u, q); }
  @Get("matching/:id/audit") audit(@CurrentUser() u: JwtUser, @Param("id") id: string) { return this.svc.matchAudit(u, id); }
  @Get("invoices/:id/status") status(@CurrentUser() u: JwtUser, @Param("id") id: string) { return this.svc.invoiceStatus(u, id); }
  @Get("links") links(@CurrentUser() u: JwtUser, @Query("invoiceId") invoiceId?: string, @Query("state") state?: string) { return this.svc.listLinks(u, { invoiceId, state }); }
  @Post("matching/:id/confirm") @HttpCode(200) confirm(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: PayMatchConfirmBodyDto) { return this.svc.confirm(u, id, b.invoiceId); }
  @Post("matching/:id/reject") @HttpCode(200) reject(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: PayMatchRejectBodyDto) { return this.svc.reject(u, id, b.note); }
  @Post("collections/prepare") @HttpCode(200) prepare(@CurrentUser() u: JwtUser, @Body() b: PayPrepareBodyDto) { return this.svc.prepareCollection(u, b); }
  @Post("links") @HttpCode(200) link(@CurrentUser() u: JwtUser, @Body() b: PayLinkCreateBodyDto): Promise<unknown> { return this.svc.createLink(u, b); }
  @Post("links/:id/cancel") @HttpCode(200) cancel(@CurrentUser() u: JwtUser, @Param("id") id: string) { return this.svc.cancelLink(u, id); }
  @Get("reports/rollup")
  async rollup(@CurrentUser() u: JwtUser, @Res({ passthrough: true }) res: Response, @Query("level") level = "branch", @Query("from") from?: string, @Query("to") to?: string, @Query("lang") lang = "en", @Query("format") format = "json"): Promise<unknown> {
    if (!["branch", "organisation", "psp", "day"].includes(level)) throw new BadRequestException("level must be branch, organisation, psp or day");
    const t = to ? new Date(to) : new Date(); const f = from ? new Date(from) : new Date(t.getTime() - 30 * 86_400_000);
    if (Number.isNaN(+t) || Number.isNaN(+f)) throw new BadRequestException("from / to must be dates");
    const r = await this.svc.report(u, { level: level as never, from: f, to: t, lang: lang === "ar" ? "ar" : "en", format: format === "csv" ? "csv" : format === "pdf" ? "pdf" : "json" });
    res.setHeader("content-type", r.contentType);
    if (format === "csv" || format === "pdf") res.setHeader("content-disposition", `attachment; filename="collections-rollup.${format}"`);
    return Buffer.isBuffer(r.body) ? new StreamableFile(r.body) : r.body;
  }
}

/** Public payer page data (the signed token is the credential; read-only, repeatable; the payment itself consumes the link). */
@ApiTags("billing")
@Controller("public/pay/l")
export class PayLinkPublicController {
  constructor(private readonly svc: PayCollectionsService) {}
  @Get(":token") @Header("cache-control", "no-store") view(@Param("token") token: string) { return this.svc.linkView(token); }
}
