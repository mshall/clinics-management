import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma, type PromotionReviewKind, type PromotionStatus, type SponsoredPromotion, type SponsoredPromotionVersion } from "@prisma/client";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { PrismaService } from "../prisma/prisma.service";
import { budgetState } from "./promotion-budget-math";
import { guardTexts } from "./promotion-content-guard";
import { enqueuePromotionEvent, PROMOTION_EVENT, updatedPayload } from "./promotion-events";
import { clinicalInducement, holds, priceInflation } from "./promotion-fraud.rules";
import { resolvePolicy, type SponsoredPromotionPolicy } from "./promotion-policy";
import { contentHashOf, highValueReasons, reviewKindsFor, reviewOutcome, validateVersion, type VersionInput } from "./promotion-version";

type Tx = Prisma.TransactionClient;
export interface Actor { userId: string; tenantId: string }
export interface ReviewDecisionInput { promotionId: string; version: number; reviewKind: PromotionReviewKind; decision: "APPROVED" | "REJECTED" | "NEEDS_CHANGES"; note?: string; decidedBy: string; decidedAt?: string }
export interface VersionBody { nameAr: string; nameEn: string; patientCopyAr: string; patientCopyEn: string; scope: unknown; discount: VersionInput["discount"]; budgetCapMinor: number; perPatientLimit?: number; perDayLimit?: number | null; eligibility?: unknown; startsAt: string; endsAt: string; fundingMode?: "WALLET_ONLY" | "WALLET_THEN_INVOICE" }

const EDITABLE: PromotionStatus[] = ["DRAFT", "REJECTED", "APPROVED", "ACTIVE", "PAUSED", "EXHAUSTED"];
const ACTOR_SYSTEM = "system";

/**
 * Clinic side of GRW-P2-S: create, version, submit, pause, review decisions, activation and expiry. A promotion is a provider-owned asset (ADR-041): configured here, budget and wallet here,
 * Kiorex only reviews content and scope and keeps a signed projection to quote. Versions are immutable; an edit creates a new version and starts a new review (the running version stops being offered
 * until the new one is approved; bookings already holding a reservation settle on the version they cited).
 */
@Injectable()
export class PromotionService {
  private readonly log = new Logger(PromotionService.name);
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxEventService) {}

  private async policyOf(tx: Tx | PrismaService, tenantId: string): Promise<SponsoredPromotionPolicy> {
    const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { market: { select: { featureDefaults: true } } } });
    return resolvePolicy(t?.market?.featureDefaults);
  }
  private async audit(tx: Tx, promotionId: string, actor: string, action: string, snapshot: Record<string, unknown> = {}) { await tx.promotionAudit.create({ data: { promotionId, actor, action, snapshot: snapshot as Prisma.InputJsonValue } }); }

  /** Every doctor and appointment type of the scope must belong to THIS tenant; the reference price is the visit fee of the scope (highest fee among the types it covers). */
  private async resolveScope(tx: Tx | PrismaService, tenantId: string, scope: { doctorIds: string[]; appointmentTypeIds: string[] }) {
    if (scope.doctorIds.length) { const n = await tx.user.count({ where: { id: { in: scope.doctorIds }, tenantId } }); if (n !== scope.doctorIds.length) throw new BadRequestException({ code: "SCOPE_DOCTOR_NOT_FOUND", message: "A doctor in the scope is not part of this organisation" }); }
    const types = await tx.appointmentType.findMany({ where: { tenantId, isActive: true, marketplaceBookable: true, ...(scope.appointmentTypeIds.length ? { id: { in: scope.appointmentTypeIds } } : {}) }, select: { id: true, feeAmount: true, clinicId: true } });
    if (scope.appointmentTypeIds.length && types.length !== scope.appointmentTypeIds.length) throw new BadRequestException({ code: "SCOPE_TYPE_NOT_FOUND", message: "An appointment type in the scope is not bookable on Kiorex for this organisation" });
    if (!types.length) throw new BadRequestException({ code: "SCOPE_EMPTY", message: "The clinic has no Kiorex-bookable visit type to sponsor" });
    return { referencePriceMinor: Math.max(...types.map((t) => Math.round(Number(t.feeAmount) * 100))), clinicId: types[0]!.clinicId };
  }

  private async makeVersion(tx: Tx, p: SponsoredPromotion, actor: string, body: VersionBody, policy: SponsoredPromotionPolicy, nextVersion: number, now: Date) {
    const v = validateVersion({ ...body, perPatientLimit: body.perPatientLimit ?? 1, eligibility: body.eligibility ?? {}, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), fundingMode: body.fundingMode ?? policy.defaultFundingMode }, policy, now);
    if (!v.ok) throw new UnprocessableEntityException({ code: "PROMOTION_INVALID", errors: v.errors });
    const ref = await this.resolveScope(tx, p.tenantId, v.version.scope);
    const guard = guardTexts(v.version);
    const row = await tx.sponsoredPromotionVersion.create({
      data: {
        promotionId: p.id, version: nextVersion, nameAr: v.version.nameAr, nameEn: v.version.nameEn, patientCopyAr: v.version.patientCopyAr, patientCopyEn: v.version.patientCopyEn,
        scope: v.version.scope as unknown as Prisma.InputJsonValue, discountKind: v.version.discount.kind, discountValue: v.version.discount.value, maxPerBookingMinor: v.version.discount.maxPerBookingMinor ?? null,
        budgetCapMinor: v.version.budgetCapMinor, perPatientLimit: v.version.perPatientLimit, perDayLimit: v.version.perDayLimit, eligibility: v.version.eligibility as unknown as Prisma.InputJsonValue,
        startsAt: v.version.startsAt, endsAt: v.version.endsAt, fundingMode: v.version.fundingMode, policyVersion: policy.policyVersion, referencePriceMinor: ref.referencePriceMinor,
        contentHash: contentHashOf(v.version), guardResult: guard as unknown as Prisma.InputJsonValue, createdBy: actor,
      },
    });
    return { row, guard, clinicId: ref.clinicId };
  }

  async create(a: Actor, body: VersionBody, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      const policy = await this.policyOf(tx, a.tenantId);
      const p = await tx.sponsoredPromotion.create({ data: { tenantId: a.tenantId, createdBy: a.userId } });
      const { row, guard } = await this.makeVersion(tx, p, a.userId, body, policy, 1, now);
      await tx.sponsoredPromotion.update({ where: { id: p.id }, data: { currentVersionId: row.id } });
      await this.audit(tx, p.id, a.userId, "promotion.created", { version: 1, contentHash: row.contentHash, guardOk: (guard as { ok: boolean }).ok });
      return this.view(tx, p.id);
    });
  }

  /** An edit is a new version and a new review. The promotion goes back to DRAFT: the previous version is no longer offered to new bookings. */
  async newVersion(a: Actor, id: string, body: VersionBody, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.own(tx, a.tenantId, id); await tx.$queryRaw`SELECT "id" FROM "SponsoredPromotion" WHERE "id" = ${id} FOR UPDATE`;
      if (!EDITABLE.includes(p.status)) throw new ConflictException({ code: "PROMOTION_NOT_EDITABLE", status: p.status });
      const last = await tx.sponsoredPromotionVersion.findFirstOrThrow({ where: { promotionId: id }, orderBy: { version: "desc" } });
      const policy = await this.policyOf(tx, a.tenantId);
      const { row } = await this.makeVersion(tx, p, a.userId, body, policy, last.version + 1, now);
      await tx.sponsoredPromotion.update({ where: { id }, data: { currentVersionId: row.id, status: "DRAFT", pausedAt: null, pauseReason: null } });
      await this.audit(tx, id, a.userId, "promotion.version_created", { version: row.version, contentHash: row.contentHash, previousStatus: p.status });
      await this.emitUpdated(tx, id);
      return this.view(tx, id);
    });
  }

  /** Submit runs the content guard; a blocked text is refused with the hits (nothing reaches the reviewer); otherwise the reviews are opened (CONTENT, SCOPE, and HIGH_VALUE when thresholds say so). */
  async submit(a: Actor, id: string, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.own(tx, a.tenantId, id); await tx.$queryRaw`SELECT "id" FROM "SponsoredPromotion" WHERE "id" = ${id} FOR UPDATE`;
      if (p.status !== "DRAFT" && p.status !== "REJECTED") throw new ConflictException({ code: "PROMOTION_NOT_SUBMITTABLE", status: p.status });
      const v = await this.currentVersion(tx, p);
      if (v.endsAt <= now) throw new UnprocessableEntityException({ code: "PROMOTION_INVALID", errors: ["WINDOW_IN_THE_PAST"] });
      const guard = guardTexts({ nameAr: v.nameAr, nameEn: v.nameEn, patientCopyAr: v.patientCopyAr, patientCopyEn: v.patientCopyEn });
      if (!guard.ok) { await this.audit(tx, id, a.userId, "promotion.submit_refused", { version: v.version, hits: guard.hits, signal: guard.signal }); throw new UnprocessableEntityException({ code: "PROMOTION_CONTENT_REJECTED", hits: guard.hits, signal: guard.signal, message: "The text contains wording that is not allowed in a sponsored promotion" }); }
      const policy = await this.policyOf(tx, p.tenantId);
      const kinds = reviewKindsFor({ budgetCapMinor: v.budgetCapMinor, discount: { kind: v.discountKind, value: v.discountValue, maxPerBookingMinor: v.maxPerBookingMinor } }, policy);
      const existing = await tx.promotionComplianceReview.findMany({ where: { versionId: v.id } });
      for (const kind of kinds) if (!existing.some((r) => r.kind === kind)) await tx.promotionComplianceReview.create({ data: { promotionId: id, versionId: v.id, kind, requestedBy: a.userId, guardResult: guard as unknown as Prisma.InputJsonValue } });
      await tx.sponsoredPromotion.update({ where: { id }, data: { status: "IN_REVIEW" } });
      await this.audit(tx, id, a.userId, "promotion.submitted", { version: v.version, reviews: kinds, highValue: highValueReasons({ budgetCapMinor: v.budgetCapMinor, discount: { kind: v.discountKind, value: v.discountValue, maxPerBookingMinor: v.maxPerBookingMinor } }, policy), warnings: guard.hits.filter((h) => h.severity === "WARN") });
      await this.emitUpdated(tx, id);
      return this.view(tx, id);
    });
  }

  async pause(a: Actor, id: string, reason: string | undefined) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.own(tx, a.tenantId, id); await tx.$queryRaw`SELECT "id" FROM "SponsoredPromotion" WHERE "id" = ${id} FOR UPDATE`;
      if (p.status !== "ACTIVE" && p.status !== "EXHAUSTED") throw new ConflictException({ code: "PROMOTION_NOT_PAUSABLE", status: p.status });
      await tx.sponsoredPromotion.update({ where: { id }, data: { status: "PAUSED", pausedAt: new Date(), pauseReason: (reason ?? "").slice(0, 200) || null } });
      await this.audit(tx, id, a.userId, "promotion.paused", { reason: reason ?? null }); await this.emitUpdated(tx, id);
      return this.view(tx, id);
    });
  }

  async resume(a: Actor, id: string, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.own(tx, a.tenantId, id); await tx.$queryRaw`SELECT "id" FROM "SponsoredPromotion" WHERE "id" = ${id} FOR UPDATE`;
      if (p.status !== "PAUSED") throw new ConflictException({ code: "PROMOTION_NOT_PAUSED", status: p.status });
      const v = await this.currentVersion(tx, p);
      if (v.endsAt <= now) { await tx.sponsoredPromotion.update({ where: { id }, data: { status: "EXPIRED" } }); await this.emitUpdated(tx, id); return this.view(tx, id); }
      await tx.sponsoredPromotion.update({ where: { id }, data: { status: now < v.startsAt ? "APPROVED" : "ACTIVE", pausedAt: null, pauseReason: null } });
      await this.audit(tx, id, a.userId, "promotion.resumed", {}); await this.emitUpdated(tx, id);
      return this.view(tx, id);
    });
  }

  async archive(a: Actor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.own(tx, a.tenantId, id); await tx.$queryRaw`SELECT "id" FROM "SponsoredPromotion" WHERE "id" = ${id} FOR UPDATE`;
      if (!["DRAFT", "REJECTED", "EXPIRED", "EXHAUSTED", "PAUSED", "APPROVED"].includes(p.status)) throw new ConflictException({ code: "PROMOTION_NOT_ARCHIVABLE", status: p.status });
      const open = await tx.promotionReservation.count({ where: { promotionId: id, state: { in: ["RESERVED", "BOOKED"] } } });
      if (open) throw new ConflictException({ code: "PROMOTION_HAS_OPEN_RESERVATIONS", open });
      await tx.sponsoredPromotion.update({ where: { id }, data: { status: "ARCHIVED" } });
      await this.audit(tx, id, a.userId, "promotion.archived", {}); await this.emitUpdated(tx, id);
      return this.view(tx, id);
    });
  }

  /**
   * Kiorex review decision (signed command). Idempotent per review kind. APPROVED by every required review, by different people, none of them the author: the promotion is APPROVED, and ACTIVE when its
   * window is open and no enforced fraud rule holds it (PF_PRICE_INFLATION). REJECTED: REJECTED. NEEDS_CHANGES: back to DRAFT for a new version.
   */
  async applyReviewDecision(d: ReviewDecisionInput, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.sponsoredPromotion.findUnique({ where: { id: d.promotionId } }); if (!p) throw new NotFoundException("Unknown promotion");
      await tx.$queryRaw`SELECT "id" FROM "SponsoredPromotion" WHERE "id" = ${d.promotionId} FOR UPDATE`;
      const v = await tx.sponsoredPromotionVersion.findUnique({ where: { promotionId_version: { promotionId: d.promotionId, version: d.version } } }); if (!v) throw new NotFoundException("Unknown version");
      const review = await tx.promotionComplianceReview.findUnique({ where: { versionId_kind: { versionId: v.id, kind: d.reviewKind } } });
      if (!review) throw new NotFoundException("No such review is open for this version");
      if (review.decision) { if (review.decision === d.decision && review.decidedBy === d.decidedBy) return this.view(tx, p.id); throw new ConflictException({ code: "REVIEW_ALREADY_DECIDED", decision: review.decision }); }
      if (v.id !== p.currentVersionId) throw new ConflictException({ code: "VERSION_NOT_CURRENT" });
      if (p.status !== "IN_REVIEW") throw new ConflictException({ code: "PROMOTION_NOT_IN_REVIEW", status: p.status });
      if (!d.decidedBy || d.decidedBy === review.requestedBy) throw new ForbiddenException({ code: "SELF_APPROVAL", message: "The author cannot decide their own review" });
      await tx.promotionComplianceReview.update({ where: { id: review.id }, data: { decidedBy: d.decidedBy, decision: d.decision, reason: (d.note ?? "").slice(0, 300) || null, decidedAt: d.decidedAt ? new Date(d.decidedAt) : now } });
      await this.audit(tx, p.id, d.decidedBy, `review.${d.reviewKind.toLowerCase()}.${d.decision.toLowerCase()}`, { version: v.version, note: d.note ?? null });
      const rows = await tx.promotionComplianceReview.findMany({ where: { versionId: v.id } });
      const policy = await this.policyOf(tx, p.tenantId);
      const required = reviewKindsFor({ budgetCapMinor: v.budgetCapMinor, discount: { kind: v.discountKind, value: v.discountValue, maxPerBookingMinor: v.maxPerBookingMinor } }, policy);
      const out = reviewOutcome(required, rows);
      if (out === "REJECTED") await tx.sponsoredPromotion.update({ where: { id: p.id }, data: { status: "REJECTED" } });
      else if (out === "NEEDS_CHANGES") await tx.sponsoredPromotion.update({ where: { id: p.id }, data: { status: "DRAFT" } });
      else if (out === "INVALID") await this.audit(tx, p.id, ACTOR_SYSTEM, "review.invalid_approvals", { reason: "SAME_PERSON_OR_AUTHOR" });
      else if (out === "APPROVED") await this.activateInTx(tx, p.id, now);
      await this.emitUpdated(tx, p.id);
      return this.view(tx, p.id);
    });
  }

  /** APPROVED -> ACTIVE when the window is open and PF_PRICE_INFLATION (enforced) does not hold it; an APPROVED promotion waits for its start (the scheduler). */
  private async activateInTx(tx: Tx, id: string, now: Date) {
    const p = await tx.sponsoredPromotion.findUniqueOrThrow({ where: { id } }); const v = await this.currentVersion(tx, p);
    const policy = await this.policyOf(tx, p.tenantId);
    if (v.endsAt <= now) { await tx.sponsoredPromotion.update({ where: { id }, data: { status: "EXPIRED" } }); return; }
    await tx.sponsoredPromotion.update({ where: { id }, data: { status: "APPROVED" } });
    if (now < v.startsAt) return;
    const types = await tx.appointmentType.findMany({ where: { tenantId: p.tenantId, isActive: true, marketplaceBookable: true, ...((v.scope as { appointmentTypeIds?: string[] }).appointmentTypeIds?.length ? { id: { in: (v.scope as { appointmentTypeIds: string[] }).appointmentTypeIds } } : {}) }, select: { feeAmount: true } });
    const current = Math.max(0, ...types.map((t) => Math.round(Number(t.feeAmount) * 100)));
    const sig = priceInflation({ referencePriceMinor: v.referencePriceMinor, currentPriceMinor: current, maxPriceInWindowMinor: current, bp: policy.priceInflationBp }, policy.fraudRuleWeights.PF_PRICE_INFLATION);
    const ci = clinicalInducement(((v.guardResult ?? {}) as { signal?: string | null }).signal ?? null, policy.fraudRuleWeights.PF_CLINICAL_INDUCEMENT);
    for (const s of [sig, ci]) if (s) await this.audit(tx, id, ACTOR_SYSTEM, holds(s, policy.fraudEnforce) ? "fraud.hold" : "fraud.shadow", { rule: s.rule, score: s.score, detail: s.detail, mode: holds(s, policy.fraudEnforce) ? "ENFORCE" : "SHADOW" });
    if (holds(sig, policy.fraudEnforce) || holds(ci, policy.fraudEnforce)) return; // stays APPROVED, not offered: a reviewer or the clinic must act
    await tx.sponsoredPromotion.update({ where: { id }, data: { status: "ACTIVE" } });
    await this.audit(tx, id, ACTOR_SYSTEM, "promotion.activated", { version: v.version });
  }

  /** Scheduler tick: APPROVED whose start has come become ACTIVE (price check again), ACTIVE or EXHAUSTED or PAUSED whose end has passed become EXPIRED. Returns the counts. */
  async tick(now = new Date()) {
    let activated = 0, expired = 0;
    const due = await this.prisma.sponsoredPromotion.findMany({ where: { status: { in: ["APPROVED", "ACTIVE", "EXHAUSTED", "PAUSED"] } }, take: 500, select: { id: true } });
    for (const { id } of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "SponsoredPromotion" WHERE "id" = ${id} FOR UPDATE`;
          const p = await tx.sponsoredPromotion.findUniqueOrThrow({ where: { id } }); const v = await this.currentVersion(tx, p);
          if (v.endsAt <= now && p.status !== "EXPIRED") { await tx.sponsoredPromotion.update({ where: { id }, data: { status: "EXPIRED" } }); await this.audit(tx, id, ACTOR_SYSTEM, "promotion.expired", {}); await this.emitUpdated(tx, id); expired++; }
          else if (p.status === "APPROVED" && v.startsAt <= now) { await this.activateInTx(tx, id, now); const after = await tx.sponsoredPromotion.findUniqueOrThrow({ where: { id } }); if (after.status === "ACTIVE") { activated++; await this.emitUpdated(tx, id); } }
        });
      } catch (e) { this.log.warn(`promotion tick ${id}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return { activated, expired };
  }

  // ───────────────────────────── reads
  private async own(tx: Tx | PrismaService, tenantId: string, id: string) { const p = await tx.sponsoredPromotion.findFirst({ where: { id, tenantId } }); if (!p) throw new NotFoundException("Promotion not found"); return p; }
  private async currentVersion(tx: Tx | PrismaService, p: SponsoredPromotion): Promise<SponsoredPromotionVersion> { const v = p.currentVersionId ? await tx.sponsoredPromotionVersion.findUnique({ where: { id: p.currentVersionId } }) : null; if (!v) throw new NotFoundException("Promotion has no version"); return v; }

  async list(tenantId: string) {
    const rows = await this.prisma.sponsoredPromotion.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 200 });
    return Promise.all(rows.map((r) => this.view(this.prisma, r.id)));
  }
  async get(tenantId: string, id: string) { await this.own(this.prisma, tenantId, id); return this.view(this.prisma, id); }

  /** Owner view: current version, budget state (reserved, debited, remaining, burn), reservation counts, reviews. Opaque references only: no patient reference leaves the clinic. */
  async view(tx: Tx | PrismaService, id: string) {
    const p = await tx.sponsoredPromotion.findUniqueOrThrow({ where: { id }, include: { versions: { orderBy: { version: "asc" } } } });
    const v = p.versions.find((x) => x.id === p.currentVersionId) ?? p.versions[p.versions.length - 1]!;
    const [entries, byState, reviews] = await Promise.all([
      tx.promotionBudgetEntry.findMany({ where: { promotionId: id }, select: { type: true, amountMinor: true } }),
      tx.promotionReservation.groupBy({ by: ["state"], where: { promotionId: id }, _count: { _all: true } }),
      tx.promotionComplianceReview.findMany({ where: { versionId: v.id }, select: { kind: true, decision: true, reason: true, decidedAt: true, createdAt: true } }),
    ]);
    const st = budgetState(entries, v.budgetCapMinor);
    return {
      id: p.id, status: p.status, createdAt: p.createdAt, pausedAt: p.pausedAt, pauseReason: p.pauseReason,
      version: { id: v.id, version: v.version, nameAr: v.nameAr, nameEn: v.nameEn, patientCopyAr: v.patientCopyAr, patientCopyEn: v.patientCopyEn, scope: v.scope, discountKind: v.discountKind, discountValue: v.discountValue, maxPerBookingMinor: v.maxPerBookingMinor, budgetCapMinor: v.budgetCapMinor, perPatientLimit: v.perPatientLimit, perDayLimit: v.perDayLimit, eligibility: v.eligibility, startsAt: v.startsAt, endsAt: v.endsAt, fundingMode: v.fundingMode, policyVersion: v.policyVersion, contentHash: v.contentHash },
      versions: p.versions.length,
      budget: { capMinor: st.capMinor, reservedMinor: st.heldMinor, debitedMinor: st.netDebitedMinor, remainingMinor: st.remainingMinor, exposureMinor: st.exposureMinor },
      reservations: Object.fromEntries(byState.map((g) => [g.state, g._count._all])),
      reviews, guard: v.guardResult,
    };
  }

  /** Ledger of a promotion: budget entries (append-only), newest first. Booking and reservation references are opaque ids. */
  async ledger(tenantId: string, id: string, page = 1, pageSize = 50) {
    await this.own(this.prisma, tenantId, id);
    const take = Math.min(Math.max(pageSize, 1), 200); const skip = (Math.max(page, 1) - 1) * take;
    const [rows, total] = await Promise.all([
      this.prisma.promotionBudgetEntry.findMany({ where: { promotionId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take, select: { id: true, type: true, amountMinor: true, currency: true, reason: true, bookingRef: true, appointmentId: true, walletEntryId: true, invoiceLineId: true, createdAt: true } }),
      this.prisma.promotionBudgetEntry.count({ where: { promotionId: id } }),
    ]);
    return { rows, total, page: Math.max(page, 1), pageSize: take };
  }

  private async emitUpdated(tx: Tx, id: string) {
    const p = await tx.sponsoredPromotion.findUniqueOrThrow({ where: { id } }); const v = await this.currentVersion(tx, p);
    const type = await tx.appointmentType.findFirst({ where: { tenantId: p.tenantId, isActive: true, marketplaceBookable: true }, select: { clinicId: true } });
    const policy = await this.policyOf(tx, p.tenantId);
    const reviewKinds = reviewKindsFor({ budgetCapMinor: v.budgetCapMinor, discount: { kind: v.discountKind, value: v.discountValue, maxPerBookingMinor: v.maxPerBookingMinor } }, policy);
    await enqueuePromotionEvent(this.outbox, tx, p.tenantId, PROMOTION_EVENT.UPDATED, id, updatedPayload(p, v, type?.clinicId ?? null, new Date(), { reviewKinds }));
  }
}
