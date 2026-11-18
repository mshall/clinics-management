import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import { isReviewInvitationEligible } from "../messaging/review-invitation";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { OUTBOX_EVENT } from "../messaging/outbox-event-types";
import { PrismaService } from "../prisma/prisma.service";
import { weightedKiorexRating } from "../reports/reports-aggregation";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";

export type ReviewAggregateBody = {
  clinicId: string;
  clinicianId: string;
  averageRating: number;
  reviewCount: number;
  reviews?: {
    reviewId: string;
    appointmentId: string;
    rating: number;
    comment?: string | null;
    createdAt: string;
    moderationStatus?: "VISIBLE" | "HIDDEN";
  }[];
};

export const REVIEW_REJECT = {
  NOT_A_COMPLETED_VISIT: "NOT_A_COMPLETED_VISIT",
  INVALID: "INVALID",
} as const;

const REPLY_MAX = 1000;

@Injectable()
export class KiorexReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MarketplaceAccessService,
    private readonly listings: MarketplaceListingService,
    private readonly outbox: OutboxEventService,
    private readonly audit: AuditService,
  ) {}

  /** KX-08: Kiorex pushes the doctor's aggregate plus recent reviews; reviews not tied to a completed Kiorex visit are rejected. */
  async syncAggregate(client: PlatformIntegrationPrincipal, body: ReviewAggregateBody) {
    const avg = Number(body.averageRating);
    const count = Number(body.reviewCount);
    if (!body.clinicId || !body.clinicianId) throw new BadRequestException("clinicId and clinicianId are required");
    if (!Number.isFinite(avg) || avg < 0 || avg > 5 || !Number.isInteger(count) || count < 0) {
      throw new BadRequestException("averageRating must be 0–5 and reviewCount a non-negative integer");
    }
    const tenantId = await this.access.resolveTenantForMarketplaceClinic(body.clinicId, body.clinicianId);
    const now = new Date();
    await this.prisma.kiorexRating.upsert({
      where: { clinicId_clinicianId: { clinicId: body.clinicId, clinicianId: body.clinicianId } },
      create: {
        tenantId,
        clinicId: body.clinicId,
        clinicianId: body.clinicianId,
        averageRating: new Prisma.Decimal(avg.toFixed(2)),
        reviewCount: count,
        syncedAt: now,
      },
      update: { averageRating: new Prisma.Decimal(avg.toFixed(2)), reviewCount: count, syncedAt: now },
    });

    const reviews = body.reviews ?? [];
    const appointmentIds = [...new Set(reviews.map((r) => r.appointmentId).filter(Boolean))];
    const visits = await this.prisma.appointment.findMany({
      where: { id: { in: appointmentIds }, tenantId, clinicId: body.clinicId, clinicianId: body.clinicianId },
      select: { id: true, status: true, bookingSource: true },
    });
    const verified = new Set(
      visits.filter((v) => isReviewInvitationEligible(v.status, v.bookingSource)).map((v) => v.id),
    );

    const accepted: string[] = [];
    const rejected: { reviewId: string; reason: string }[] = [];
    for (const r of reviews) {
      const reviewedAt = new Date(r.createdAt);
      if (!r.reviewId || !Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5 || Number.isNaN(reviewedAt.getTime())) {
        rejected.push({ reviewId: r.reviewId, reason: REVIEW_REJECT.INVALID });
        continue;
      }
      if (!verified.has(r.appointmentId)) {
        rejected.push({ reviewId: r.reviewId, reason: REVIEW_REJECT.NOT_A_COMPLETED_VISIT });
        continue;
      }
      const data = {
        rating: r.rating,
        comment: r.comment?.slice(0, 4000) ?? null,
        moderationStatus: r.moderationStatus === "HIDDEN" ? "HIDDEN" : "VISIBLE",
        reviewedAt,
      };
      await this.prisma.kiorexReview.upsert({
        where: { kiorexReviewId: r.reviewId },
        create: {
          tenantId,
          clinicId: body.clinicId,
          clinicianId: body.clinicianId,
          kiorexReviewId: r.reviewId,
          appointmentId: r.appointmentId,
          ...data,
        },
        update: data,
      });
      accepted.push(r.reviewId);
    }

    await this.audit.recordEvent({
      tenantId,
      actorId: null,
      clinicId: body.clinicId,
      action: "marketplace.reviews.synced",
      resource: "KiorexRating",
      resourceId: body.clinicianId,
      metadata: { platformClientId: client.id, averageRating: avg, reviewCount: count, accepted: accepted.length, rejected },
    });
    return { ok: true, accepted, rejected };
  }

  async listForClinic(user: JwtUser, clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId: user.tenantId ?? undefined },
      select: { id: true, tenantId: true },
    });
    if (!clinic) throw new NotFoundException("Clinic not found");
    this.listings.assertClinicManage(user, clinic.tenantId);
    const [ratings, reviews] = await Promise.all([
      this.prisma.kiorexRating.findMany({ where: { clinicId }, orderBy: { reviewCount: "desc" } }),
      this.prisma.kiorexReview.findMany({
        where: { clinicId, moderationStatus: "VISIBLE" },
        orderBy: { reviewedAt: "desc" },
        take: 20,
      }),
    ]);
    const clinicianIds = [...new Set([...ratings, ...reviews].map((r) => r.clinicianId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: clinicianIds } },
      select: { id: true, displayName: true },
    });
    const name = new Map(users.map((u) => [u.id, u.displayName]));
    return {
      clinicId,
      overall: weightedKiorexRating(ratings),
      doctors: ratings.map((r) => ({
        clinicianId: r.clinicianId,
        clinicianName: name.get(r.clinicianId) ?? null,
        averageRating: Number(r.averageRating),
        reviewCount: r.reviewCount,
        syncedAt: r.syncedAt.toISOString(),
      })),
      reviews: reviews.map((r) => ({
        id: r.id,
        clinicianId: r.clinicianId,
        clinicianName: name.get(r.clinicianId) ?? null,
        rating: r.rating,
        comment: r.comment,
        reviewedAt: r.reviewedAt.toISOString(),
        replyText: r.replyText,
        repliedAt: r.repliedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Clinic replies from Kiorly; Kiorex publishes it (and moderates) — sent through the outbox. */
  async reply(user: JwtUser, reviewId: string, text: string) {
    const review = await this.prisma.kiorexReview.findFirst({
      where: { id: reviewId, tenantId: user.tenantId ?? undefined },
    });
    if (!review) throw new NotFoundException("Review not found");
    this.listings.assertClinicManage(user, review.tenantId);
    const replyText = (text ?? "").trim();
    if (replyText.length < 2 || replyText.length > REPLY_MAX) {
      throw new BadRequestException(`Reply must be 2–${REPLY_MAX} characters`);
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.kiorexReview.update({
        where: { id: review.id },
        data: { replyText, repliedAt: now, repliedByUserId: user.userId },
      });
      await this.outbox.enqueueEvent(
        {
          tenantId: review.tenantId,
          type: OUTBOX_EVENT.REVIEW_REPLY_POSTED,
          aggregateType: "KiorexReview",
          aggregateId: review.id,
          payload: { kiorexReviewId: review.kiorexReviewId, clinicId: review.clinicId, replyText, repliedAt: now.toISOString() },
        },
        tx,
      );
      return row;
    });
    await this.audit.recordEvent({
      tenantId: review.tenantId,
      actorId: user.userId,
      clinicId: review.clinicId,
      action: "kiorex.review.replied",
      resource: "KiorexReview",
      resourceId: review.id,
      metadata: { kiorexReviewId: review.kiorexReviewId, edited: Boolean(review.replyText) },
    });
    return { id: updated.id, replyText: updated.replyText, repliedAt: updated.repliedAt?.toISOString() ?? null };
  }
}
