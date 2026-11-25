import { Body, Controller, ForbiddenException, HttpCode, NotFoundException, Param, Post, Res, ServiceUnavailableException, UseGuards, ConflictException } from "@nestjs/common";
import type { Response } from "express";
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ListingStatus } from "@prisma/client";
import { MarketplaceAuthGuard } from "../marketplace/marketplace-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { PromotionBudgetService, ReserveBusyError } from "./promotion-budget.service";
import { parseReserve, parseRelease, parseReverse, parseReviewDecision } from "./promotion-commands";
import { PromotionService } from "./promotion.service";

/**
 * Signed commands from Kiorex (same HMAC guard as every marketplace call). The Clinic is the system of record of the budget and the wallet; Kiorex asks, the Clinic re-checks and answers.
 *  POST /marketplace/v1/promotions/{id}/reserve  (contracts 1.12.0)   200 {reservationRef, expiresAt} | 409 {code}
 *  POST /marketplace/v1/promotions/{id}/release  (contracts 1.12.0)   200 always (idempotent)
 *  POST /marketplace/v1/promotions/{id}/reverse  (refund after completion; contracts 1.12.1 request)
 *  POST /marketplace/v1/promotions/{id}/review-decision  (PromotionReviewDecided, Kiorex to Clinic; contracts 1.12.1 request)
 */
@ApiTags("marketplace-promotions")
@Controller("marketplace/v1/promotions")
@UseGuards(MarketplaceAuthGuard)
@ApiHeader({ name: "X-Kiorly-Client-Key", required: true })
@ApiHeader({ name: "X-Kiorly-Signature", required: true })
export class PromotionsMarketplaceController {
  constructor(private readonly prisma: PrismaService, private readonly budget: PromotionBudgetService, private readonly promos: PromotionService) {}

  private async tenantOf(promotionId: string) {
    const p = await this.prisma.sponsoredPromotion.findUnique({ where: { id: promotionId }, select: { tenantId: true } });
    if (!p) throw new NotFoundException({ code: "PROMOTION_NOT_FOUND" });
    return p.tenantId;
  }

  @Post(":promotionId/reserve") @HttpCode(200) @ApiOperation({ summary: "Hold budget of a provider-sponsored promotion for one booking (signed, idempotent)" })
  @ApiResponse({ status: 200, description: "Reserved: {reservationRef, expiresAt}" })
  @ApiResponse({ status: 503, description: "The promotion is busy: retry with the same idempotency key after the Retry-After seconds. Nothing was reserved." })
  async reserve(@Param("promotionId") promotionId: string, @Body() body: unknown, @Res({ passthrough: true }) res?: Response) {
    const i = parseReserve(body); const tenantId = await this.tenantOf(promotionId);
    if (!(await this.prisma.marketplaceListing.count({ where: { tenantId, status: ListingStatus.LIVE } }))) throw new ForbiddenException({ code: "MARKETPLACE_LISTING_REQUIRED" });
    let r;
    try { r = await this.budget.reserve({ ...i, promotionId }); } catch (e) {
      // busy promotion: nothing was written, the cap is untouched; the caller retries with the same Idempotency-Key
      if (e instanceof ReserveBusyError) { res?.setHeader("Retry-After", String(e.retryAfterSeconds)); throw new ServiceUnavailableException({ code: "PROMOTION_RESERVE_BUSY", message: "The promotion is busy, retry shortly", retryAfterSeconds: e.retryAfterSeconds }); }
      throw e;
    }
    if (!r.ok) throw new ConflictException({ code: r.reason, message: r.message });
    return { reservationRef: r.reservationRef, expiresAt: r.expiresAt.toISOString() };
  }

  @Post(":promotionId/release") @HttpCode(200) @ApiOperation({ summary: "Release a reservation (hold expired, booking cancelled or not confirmed); unknown or released answers 200" })
  async release(@Param("promotionId") promotionId: string, @Body() body: unknown) {
    const i = parseRelease(body); await this.tenantOf(promotionId);
    const r = await this.budget.release({ promotionId, ...i }, i.reason ?? "RELEASED_BY_KIOREX"); return { released: r.released };
  }

  @Post(":promotionId/reverse") @HttpCode(200) @ApiOperation({ summary: "A refund or dispute after completion: reverse the debit once (the clinic gets its credit back)" })
  async reverse(@Param("promotionId") promotionId: string, @Body() body: unknown) {
    const i = parseReverse(body); const tenantId = await this.tenantOf(promotionId);
    const r = await this.prisma.promotionReservation.findUnique({ where: { reservationRef: i.reservationRef } });
    if (!r || r.promotionId !== promotionId || !r.appointmentId) return { reversed: false };
    return this.budget.reverseForAppointment(tenantId, r.appointmentId, i.reason ?? "REFUNDED");
  }

  @Post(":promotionId/review-decision") @HttpCode(200) @ApiOperation({ summary: "Kiorex review decision (PromotionReviewDecided): the author cannot decide, a high-value promotion needs a second approver" })
  async reviewDecision(@Param("promotionId") promotionId: string, @Body() body: unknown) {
    const d = parseReviewDecision(body); await this.tenantOf(promotionId);
    const v = await this.promos.applyReviewDecision({ promotionId, ...d }); return { id: v.id, status: v.status };
  }
}
