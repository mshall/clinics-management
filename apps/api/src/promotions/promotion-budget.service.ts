import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma, type PromotionReservation, type SponsoredPromotion, type SponsoredPromotionVersion } from "@prisma/client";
import { CreditPromotionHoldService } from "../credits/credit-promotion-hold.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { FeatureFlagsService, flagOn } from "../feature-flags/feature-flags-public";
import { DEFAULT_SLOT_HOLD_MINUTES } from "../marketplace/marketplace-booking.constants";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { PrismaService } from "../prisma/prisma.service";
import { budgetState } from "./promotion-budget-math";
import { type BookingFacts, checkBooking, checkLimits, checkReservable, discountMinor, type PromotionEligibility, type PromotionScope, type Refusal } from "./promotion-eligibility";
import { discountPayload, enqueuePromotionEvent, PROMOTION_EVENT } from "./promotion-events";
import { farm, holds, noAttendance, selfDeal, velocity, type FraudSignal } from "./promotion-fraud.rules";
import { burnRatio } from "./promotion-budget-math";
import { resolvePolicy, type SponsoredPromotionPolicy } from "./promotion-policy";

type Tx = Prisma.TransactionClient;
type PV = SponsoredPromotion & { versions: SponsoredPromotionVersion[] };

export interface ReserveInput { promotionId: string; version: number; bookingRef: string; patientRef: string; careType: string; amountMinor: number; currency: string; idempotencyKey: string }
export type ReserveResult = { ok: true; reservationRef: string; expiresAt: Date; replay: boolean } | { ok: false; reason: Refusal; message: string };
export interface ReleaseInput { promotionId: string; reservationRef: string; idempotencyKey: string; reason?: string }

const MINOR = (m: number) => (m / 100).toFixed(2);
const MAX_RETRIES = 5;
const cairoDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const lockPromotion = (tx: Tx, id: string) => tx.$queryRaw`SELECT "id" FROM "SponsoredPromotion" WHERE "id" = ${id} FOR UPDATE`;

/**
 * GRW-P2-S booking-time budget: reserve, release, debit, reverse. The budget is the append-only PromotionBudgetEntry ledger; the promotion row is locked FOR UPDATE for every write, and the database refuses
 * any commit that would leave reserved + debited - released - reversed above the cap (RC-S2). The clinic wallet is touched through CreditPromotionHoldService in the SAME transaction as the budget entry,
 * so the two ledgers cannot disagree. Provider credit only: nothing here reads or writes a patient ledger, and `patientRef` is an opaque hash.
 */
@Injectable()
export class PromotionBudgetService {
  private readonly log = new Logger(PromotionBudgetService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly hold: CreditPromotionHoldService,
    private readonly wallet: CreditWalletService,
    private readonly outbox: OutboxEventService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  private async policyOf(tx: Tx, tenantId: string): Promise<SponsoredPromotionPolicy> {
    const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { market: { select: { featureDefaults: true } } } });
    return resolvePolicy(t?.market?.featureDefaults);
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e) { if (e instanceof ConflictException && i < MAX_RETRIES - 1) continue; throw e; }
    }
  }

  private current(p: PV): SponsoredPromotionVersion | undefined { return p.versions.find((v) => v.id === p.currentVersionId); }
  private async load(tx: Tx, promotionId: string): Promise<PV | null> { return tx.sponsoredPromotion.findUnique({ where: { id: promotionId }, include: { versions: true } }); }

  private async entries(tx: Tx, promotionId: string) { return tx.promotionBudgetEntry.findMany({ where: { promotionId }, select: { type: true, amountMinor: true } }); }

  /** Keeps the promotion state in step with its budget: EXHAUSTED when nothing more can be reserved, ACTIVE again when budget is freed inside the window. */
  private async syncExhausted(tx: Tx, p: PV, v: SponsoredPromotionVersion, now = new Date()) {
    const st = budgetState(await this.entries(tx, p.id), v.budgetCapMinor);
    const smallest = v.discountKind === "FIXED_MINOR" ? Math.min(v.discountValue, v.maxPerBookingMinor ?? v.discountValue) : 1;
    if (p.status === "ACTIVE" && st.remainingMinor < Math.max(1, smallest)) await tx.sponsoredPromotion.update({ where: { id: p.id }, data: { status: "EXHAUSTED" } });
    else if (p.status === "EXHAUSTED" && st.remainingMinor >= Math.max(1, smallest) && now >= v.startsAt && now < v.endsAt) await tx.sponsoredPromotion.update({ where: { id: p.id }, data: { status: "ACTIVE" } });
  }

  private async audit(tx: Tx, promotionId: string, actor: string, action: string, snapshot: Record<string, unknown>) { await tx.promotionAudit.create({ data: { promotionId, actor, action, snapshot: snapshot as Prisma.InputJsonValue } }); }

  private async recordShadow(tx: Tx, promotionId: string, signal: FraudSignal | null, policy: SponsoredPromotionPolicy, ctx: Record<string, unknown>) {
    if (!signal) return;
    await this.audit(tx, promotionId, "system", holds(signal, policy.fraudEnforce) ? "fraud.hold" : "fraud.shadow", { rule: signal.rule, score: signal.score, detail: signal.detail, mode: holds(signal, policy.fraudEnforce) ? "ENFORCE" : "SHADOW", ...ctx });
  }

  /** Reserve (called by the signed marketplace command). Never throws a business refusal: it returns `{ ok: false, reason }` with the contract reason. */
  async reserve(i: ReserveInput, now = new Date()): Promise<ReserveResult> {
    const promo = await this.prisma.sponsoredPromotion.findUnique({ where: { id: i.promotionId }, select: { tenantId: true } });
    if (!promo) return { ok: false, reason: "NOT_ELIGIBLE", message: "UNKNOWN_PROMOTION" };
    if (this.flags && !(await flagOn(this.flags, promo.tenantId, "clinic.provider_credit_v2"))) return { ok: false, reason: "PAUSED", message: "PROVIDER_CREDIT_DISABLED" };
    return this.retry(() => this.prisma.$transaction(async (tx) => {
      await lockPromotion(tx, i.promotionId);
      const prior = await tx.promotionReservation.findUnique({ where: { idempotencyKey: i.idempotencyKey } });
      if (prior) return prior.state === "RELEASED" ? ({ ok: false, reason: "NOT_ELIGIBLE", message: "RESERVATION_RELEASED" } as const) : ({ ok: true, reservationRef: prior.reservationRef, expiresAt: prior.expiresAt, replay: true } as const);
      const p = await this.load(tx, i.promotionId); if (!p) return { ok: false, reason: "NOT_ELIGIBLE", message: "UNKNOWN_PROMOTION" } as const;
      const v = this.current(p); if (!v || v.version !== i.version) return { ok: false, reason: "NOT_ELIGIBLE", message: "VERSION_NOT_CURRENT" } as const;
      const policy = await this.policyOf(tx, p.tenantId);
      const tenant = await tx.tenant.findUnique({ where: { id: p.tenantId }, select: { baseCurrency: true } });
      if (i.currency !== (tenant?.baseCurrency ?? "EGP")) return { ok: false, reason: "NOT_ELIGIBLE", message: "CURRENCY_MISMATCH" } as const;
      const scope = v.scope as unknown as PromotionScope;
      const maxDiscount = v.discountKind === "FIXED_MINOR" ? Math.min(v.discountValue, v.maxPerBookingMinor ?? Infinity) : (v.maxPerBookingMinor ?? 0);
      if (!Number.isInteger(i.amountMinor) || i.amountMinor < 1 || i.amountMinor > maxDiscount) return { ok: false, reason: "NOT_ELIGIBLE", message: "AMOUNT_NOT_ALLOWED" } as const;
      const reservable = checkReservable({ status: p.status, startsAt: v.startsAt, endsAt: v.endsAt, scope, eligibility: v.eligibility as unknown as PromotionEligibility, perPatientLimit: v.perPatientLimit, perDayLimit: v.perDayLimit }, i.careType, now);
      if (!reservable.ok) return { ok: false, reason: reservable.reason, message: reservable.detail } as const;
      // per-patient and per-day limits (reservations that still count: held, booked or debited)
      const live = { in: ["RESERVED", "BOOKED", "DEBITED"] as PromotionReservation["state"][] };
      const patientUses = await tx.promotionReservation.count({ where: { promotionId: p.id, patientRef: i.patientRef, state: live } });
      const today = cairoDay(now);
      const recent = await tx.promotionReservation.findMany({ where: { promotionId: p.id, state: live, createdAt: { gte: new Date(now.getTime() - 36 * 3_600_000) } }, select: { createdAt: true } });
      const lim = checkLimits({ perPatientLimit: v.perPatientLimit, perDayLimit: v.perDayLimit }, { patientUses, dayUses: recent.filter((r) => cairoDay(r.createdAt) === today).length });
      if (!lim.ok) return { ok: false, reason: lim.reason, message: lim.detail } as const;
      // budget
      const st = budgetState(await this.entries(tx, p.id), v.budgetCapMinor);
      if (st.remainingMinor < i.amountMinor) { await this.syncExhausted(tx, p, v, now); return { ok: false, reason: "BUDGET_EXHAUSTED", message: "CAP" } as const; }
      // wallet: the clinic's own promotion credit. WALLET_ONLY needs full cover now; WALLET_THEN_INVOICE may fall short (the shortfall is invoiced at completion).
      const reservationRef = `prs_${randomUUID()}`;
      try {
        await this.hold.reserve(p.tenantId, { promotionRef: p.id, holdRef: reservationRef, amount: MINOR(i.amountMinor) }, tx, { allowShortfall: v.fundingMode === "WALLET_THEN_INVOICE" });
      } catch (e) {
        if (e instanceof ConflictException) throw e;
        const code = (e as { response?: { code?: string } })?.response?.code;
        if (code === "PROMOTION_CREDIT_INSUFFICIENT") return { ok: false, reason: "WALLET_INSUFFICIENT", message: "WALLET" } as const;
        throw e;
      }
      const expiresAt = new Date(now.getTime() + (DEFAULT_SLOT_HOLD_MINUTES + policy.reservationTtlGraceMinutes) * 60_000);
      const row = await tx.promotionReservation.create({ data: { tenantId: p.tenantId, promotionId: p.id, versionId: v.id, reservationRef, bookingRef: i.bookingRef, patientRef: i.patientRef, careType: i.careType, amountMinor: i.amountMinor, currency: i.currency, expiresAt, idempotencyKey: i.idempotencyKey } });
      await tx.promotionBudgetEntry.create({ data: { promotionId: p.id, versionId: v.id, type: "RESERVE", amountMinor: i.amountMinor, currency: i.currency, idempotencyKey: `reserve:${reservationRef}`, bookingRef: i.bookingRef, reservationId: row.id, reason: "BOOKING_HOLD" } });
      // shadow-first fraud signals (never block a reservation that is allowed; enforced rules are checked at booking and at completion)
      const sinceDay = new Date(now.getTime() - 24 * 3_600_000);
      const byPatient = await tx.promotionReservation.count({ where: { tenantId: p.tenantId, patientRef: i.patientRef, createdAt: { gte: sinceDay } } });
      await this.recordShadow(tx, p.id, farm({ reservationsByPatientInWindow: byPatient, distinctPromotions: 1 }, policy.fraudRuleWeights.PF_FARM), policy, { reservationRef });
      const spent24 = (await tx.promotionBudgetEntry.aggregate({ where: { promotionId: p.id, type: "RESERVE", createdAt: { gte: sinceDay } }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0;
      await this.recordShadow(tx, p.id, velocity({ burnRatio: burnRatio(spent24, 24, v.budgetCapMinor, Math.max(1, (v.endsAt.getTime() - v.startsAt.getTime()) / 3_600_000)) }, policy.fraudRuleWeights.PF_VELOCITY), policy, { reservationRef });
      await this.audit(tx, p.id, "kiorex", "reservation.reserved", { reservationRef, bookingRef: i.bookingRef, amountMinor: i.amountMinor });
      await enqueuePromotionEvent(this.outbox, tx, p.tenantId, PROMOTION_EVENT.RESERVED, p.id, discountPayload({ promotionId: p.id, version: v.version, reservationRef, bookingRef: i.bookingRef, amountMinor: i.amountMinor, currency: i.currency }, now));
      await this.syncExhausted(tx, p, v, now);
      return { ok: true, reservationRef, expiresAt, replay: false } as const;
    }, { timeout: 20_000, maxWait: 20_000 }));
  }

  /** Releases an unspent hold (cancelled, expired, not confirmed, or a booking that could not use the discount). Idempotent; an unknown or already released reservation is a no-op. */
  async release(i: ReleaseInput, reason = "RELEASED", tx0?: Tx): Promise<{ released: boolean }> {
    const run = async (tx: Tx) => {
      const r = await tx.promotionReservation.findUnique({ where: { reservationRef: i.reservationRef } });
      if (!r || r.promotionId !== i.promotionId) return { released: false };
      await lockPromotion(tx, r.promotionId);
      const fresh = await tx.promotionReservation.findUniqueOrThrow({ where: { id: r.id } });
      if (fresh.state !== "RESERVED" && fresh.state !== "BOOKED") return { released: false };
      await tx.promotionBudgetEntry.create({ data: { promotionId: r.promotionId, versionId: r.versionId, type: "RELEASE", amountMinor: r.amountMinor, currency: r.currency, idempotencyKey: `release:${r.reservationRef}`, bookingRef: r.bookingRef, appointmentId: r.appointmentId, reservationId: r.id, reason } });
      await this.hold.release(r.tenantId, { promotionRef: r.promotionId, holdRef: r.reservationRef }, tx);
      await tx.promotionReservation.update({ where: { id: r.id }, data: { state: "RELEASED", settledAt: new Date() } });
      const p = await this.load(tx, r.promotionId); const v = p && this.current(p);
      const ver = await tx.sponsoredPromotionVersion.findUniqueOrThrow({ where: { id: r.versionId } });
      await this.audit(tx, r.promotionId, "system", "reservation.released", { reservationRef: r.reservationRef, reason });
      await enqueuePromotionEvent(this.outbox, tx, r.tenantId, PROMOTION_EVENT.RELEASED, r.promotionId, discountPayload({ promotionId: r.promotionId, version: ver.version, reservationRef: r.reservationRef, bookingRef: r.bookingRef, amountMinor: r.amountMinor, currency: r.currency, reason: /^[A-Z][A-Z0-9_]{2,63}$/.test(reason) ? reason : "RELEASED" }));
      if (p && v) await this.syncExhausted(tx, p, v);
      return { released: true };
    };
    return tx0 ? run(tx0) : this.retry(() => this.prisma.$transaction(run, { timeout: 20_000, maxWait: 20_000 }));
  }

  /**
   * Called inside the marketplace booking transaction when the booking carries a `sponsoredDiscount` block. The booking is NEVER refused because of the discount: an invalid or stale reservation, or a
   * booking the promotion does not cover, releases the hold and the booking goes on without the discount (the answer says so). Returns what applied.
   */
  async confirmForBooking(tx: Tx, tenantId: string, b: { promotionId: string; promotionVersion: number; reservationRef: string; amountMinor: number; currency: string; bookingRef: string; appointmentId: string; facts: BookingFacts; patientPhone: string | null; now?: Date }): Promise<{ applied: boolean; reason?: string; amountMinor?: number }> {
    const now = b.now ?? new Date();
    const r = await tx.promotionReservation.findUnique({ where: { reservationRef: b.reservationRef } });
    const drop = async (reason: string) => { if (r && r.tenantId === tenantId && (r.state === "RESERVED")) await this.release({ promotionId: r.promotionId, reservationRef: r.reservationRef, idempotencyKey: `drop:${r.reservationRef}` }, "BOOKING_NOT_ELIGIBLE", tx); return { applied: false, reason } as const; };
    if (!r || r.tenantId !== tenantId || r.promotionId !== b.promotionId) return { applied: false, reason: "RESERVATION_NOT_FOUND" };
    if (r.state === "BOOKED" && r.appointmentId === b.appointmentId) return { applied: true, amountMinor: r.amountMinor }; // replay
    if (r.state !== "RESERVED") return { applied: false, reason: `RESERVATION_${r.state}` };
    if (r.bookingRef !== b.bookingRef) return drop("BOOKING_REF_MISMATCH");
    const ver = await tx.sponsoredPromotionVersion.findUnique({ where: { id: r.versionId } });
    if (!ver || ver.version !== b.promotionVersion || r.amountMinor !== b.amountMinor || r.currency !== b.currency) return drop("RESERVATION_MISMATCH");
    const p = await tx.sponsoredPromotion.findUnique({ where: { id: r.promotionId } });
    if (!p || (p.status !== "ACTIVE" && p.status !== "EXHAUSTED" && p.status !== "PAUSED")) return drop("PROMOTION_NOT_ACTIVE"); // a pause after the hold does not cancel a patient's discount; an expired or rejected promotion does
    const policy = await this.policyOf(tx, tenantId);
    const elig = checkBooking({ scope: ver.scope as unknown as PromotionScope, eligibility: ver.eligibility as unknown as PromotionEligibility }, b.facts, now);
    if (!elig.ok) return drop(elig.detail);
    if (discountMinor({ kind: ver.discountKind, value: ver.discountValue, maxPerBookingMinor: ver.maxPerBookingMinor }, b.facts.visitFeeMinor) < r.amountMinor) return drop("AMOUNT_ABOVE_DISCOUNT");
    const staff = await tx.employee.findMany({ where: { tenantId }, select: { phone: true }, take: 2000 });
    const sd = selfDeal(b.patientPhone, staff.map((s) => s.phone), policy.fraudRuleWeights.PF_SELF_DEAL);
    await this.recordShadow(tx, r.promotionId, sd, policy, { reservationRef: r.reservationRef });
    if (holds(sd, policy.fraudEnforce)) return drop("PF_SELF_DEAL"); // hold and review: the booking stands, the discount is not granted
    await tx.promotionReservation.update({ where: { id: r.id }, data: { state: "BOOKED", appointmentId: b.appointmentId } });
    await this.audit(tx, r.promotionId, "system", "reservation.booked", { reservationRef: r.reservationRef, appointmentId: b.appointmentId });
    return { applied: true, amountMinor: r.amountMinor };
  }

  /**
   * Completion: debits the clinic wallet exactly once. Needs attendance evidence (check-in, then COMPLETED or checked in 24 h ago): without it nothing is debited (PF_NO_ATTENDANCE, a hard rule).
   * The RELEASE (converted) and DEBIT entries, the wallet consume and the reservation state change commit together.
   */
  async debitForAppointment(tenantId: string, appointmentId: string, tx0?: Tx, now = new Date()): Promise<{ state: string; debitedMinor?: number; shortfallMinor?: number }> {
    const run = async (tx: Tx) => {
      const r = await tx.promotionReservation.findFirst({ where: { tenantId, appointmentId, state: { in: ["BOOKED", "DEBITED"] } } });
      if (!r) return { state: "NONE" };
      if (r.state === "DEBITED") return { state: "DEBITED", debitedMinor: r.debitedMinor ?? 0, shortfallMinor: r.shortfallMinor ?? 0 };
      await lockPromotion(tx, r.promotionId);
      const apt = await tx.appointment.findFirst({ where: { id: appointmentId, tenantId }, select: { status: true, checkedInAt: true } });
      const sig = noAttendance({ checkedInAt: apt?.checkedInAt ?? null, status: apt?.status ?? "UNKNOWN", hoursSinceCheckIn: apt?.checkedInAt ? (now.getTime() - apt.checkedInAt.getTime()) / 3_600_000 : null }, 100);
      if (sig) { await this.audit(tx, r.promotionId, "system", "fraud.hold", { rule: sig.rule, detail: sig.detail, mode: "ENFORCE", reservationRef: r.reservationRef }); return { state: "HELD_NO_ATTENDANCE" }; }
      const ver = await tx.sponsoredPromotionVersion.findUniqueOrThrow({ where: { id: r.versionId } });
      await tx.promotionBudgetEntry.create({ data: { promotionId: r.promotionId, versionId: r.versionId, type: "RELEASE", amountMinor: r.amountMinor, currency: r.currency, idempotencyKey: `convert:${r.reservationRef}`, bookingRef: r.bookingRef, appointmentId, reservationId: r.id, reason: "CONVERTED_TO_DEBIT" } });
      const held = await this.hold.debit(tenantId, { promotionRef: r.promotionId, holdRef: r.reservationRef }, tx);
      const debitedMinor = Math.round(Number(held.debitedAmount ?? "0") * 100); const shortfallMinor = r.amountMinor - debitedMinor;
      const walletEntry = await tx.creditReservation.findFirst({ where: { tenantId, promotionRef: r.promotionId, holdRef: r.reservationRef }, select: { debitEntryId: true } });
      await tx.promotionBudgetEntry.create({ data: { promotionId: r.promotionId, versionId: r.versionId, type: "DEBIT", amountMinor: r.amountMinor, currency: r.currency, idempotencyKey: `debit:${r.reservationRef}`, bookingRef: r.bookingRef, appointmentId, reservationId: r.id, walletEntryId: walletEntry?.debitEntryId ?? null, reason: shortfallMinor > 0 ? "DEBITED_WITH_SHORTFALL" : "DEBITED" } });
      // the part the wallet could not cover is always recorded; the funding mode decides whether it becomes an invoice line (WALLET_THEN_INVOICE) or stays an uncovered amount (WALLET_ONLY, shown to the owner)
      await tx.promotionReservation.update({ where: { id: r.id }, data: { state: "DEBITED", debitedMinor, shortfallMinor, settledAt: now } });
      await this.audit(tx, r.promotionId, "system", "reservation.debited", { reservationRef: r.reservationRef, amountMinor: r.amountMinor, debitedMinor, shortfallMinor, fundingMode: ver.fundingMode });
      await enqueuePromotionEvent(this.outbox, tx, tenantId, PROMOTION_EVENT.DEBITED, r.promotionId, discountPayload({ promotionId: r.promotionId, version: ver.version, reservationRef: r.reservationRef, bookingRef: r.bookingRef, amountMinor: r.amountMinor, currency: r.currency }, now));
      return { state: "DEBITED", debitedMinor, shortfallMinor };
    };
    return tx0 ? run(tx0) : this.retry(() => this.prisma.$transaction(run, { timeout: 20_000, maxWait: 20_000 }));
  }

  /** The visit was cancelled or a no-show before completion: the hold is released (no discount was earned). */
  async releaseForAppointment(tenantId: string, appointmentId: string, reason: string, tx: Tx): Promise<{ released: boolean }> {
    const r = await tx.promotionReservation.findFirst({ where: { tenantId, appointmentId, state: { in: ["RESERVED", "BOOKED"] } } });
    if (!r) return { released: false };
    return this.release({ promotionId: r.promotionId, reservationRef: r.reservationRef, idempotencyKey: `apt:${appointmentId}` }, reason, tx);
  }

  /** A refund or dispute after completion (inside the refund window): the debit is reversed once, the clinic gets its credit back (SPONSORED_PROMOTION_REVERSAL), the budget is freed. Never pays the patient. */
  async reverseForAppointment(tenantId: string, appointmentId: string, reason: string, tx0?: Tx): Promise<{ reversed: boolean }> {
    const run = async (tx: Tx) => {
      const r = await tx.promotionReservation.findFirst({ where: { tenantId, appointmentId, state: { in: ["DEBITED"] } } });
      if (!r) return { reversed: false };
      await lockPromotion(tx, r.promotionId);
      const ver = await tx.sponsoredPromotionVersion.findUniqueOrThrow({ where: { id: r.versionId } });
      await tx.promotionBudgetEntry.create({ data: { promotionId: r.promotionId, versionId: r.versionId, type: "REVERSE_DEBIT", amountMinor: r.amountMinor, currency: r.currency, idempotencyKey: `reverse:${r.reservationRef}`, bookingRef: r.bookingRef, appointmentId, reservationId: r.id, reason } });
      await this.hold.reverse(tenantId, { promotionRef: r.promotionId, holdRef: r.reservationRef }, tx);
      // a shortfall that was already invoiced is credited back as well (the clinic paid it on the invoice); one not yet invoiced simply never will be
      let shortfall = r.shortfallMinor ?? 0;
      if (r.invoicedAt && shortfall > 0) {
        await this.wallet.grantInTransaction({ tenantId, amount: new Prisma.Decimal(MINOR(shortfall)), reason: "SPONSORED_PROMOTION_REVERSAL", tx, idempotencyKey: `promo-reversal-invoiced:${r.promotionId}:${r.reservationRef}`, sourceRef: `promotion:${r.promotionId}`, campaignRef: r.promotionId, note: "Sponsored discount reversed (invoiced shortfall returned)" });
      } else shortfall = 0;
      await tx.promotionReservation.update({ where: { id: r.id }, data: { state: "REVERSED", settledAt: new Date(), ...(r.invoicedAt ? {} : { shortfallMinor: 0 }) } });
      await this.audit(tx, r.promotionId, "system", "reservation.reversed", { reservationRef: r.reservationRef, reason });
      await enqueuePromotionEvent(this.outbox, tx, tenantId, PROMOTION_EVENT.REVERSED, r.promotionId, discountPayload({ promotionId: r.promotionId, version: ver.version, reservationRef: r.reservationRef, bookingRef: r.bookingRef, amountMinor: r.amountMinor, currency: r.currency, reason: /^[A-Z][A-Z0-9_]{2,63}$/.test(reason) ? reason : "REFUNDED" }));
      const p = await this.load(tx, r.promotionId); const v = p && this.current(p); if (p && v) await this.syncExhausted(tx, p, v);
      return { reversed: true };
    };
    return tx0 ? run(tx0) : this.retry(() => this.prisma.$transaction(run, { timeout: 20_000, maxWait: 20_000 }));
  }

  /** Sweeper: a hold that never became a booking expires with its slot hold (plus the grace) and its budget is released. */
  async sweepExpired(now = new Date(), limit = 200): Promise<number> {
    const due = await this.prisma.promotionReservation.findMany({ where: { state: "RESERVED", expiresAt: { lt: now } }, take: limit, orderBy: { expiresAt: "asc" }, select: { promotionId: true, reservationRef: true } });
    let n = 0;
    for (const d of due) { try { const r = await this.release({ promotionId: d.promotionId, reservationRef: d.reservationRef, idempotencyKey: `expire:${d.reservationRef}` }, "HOLD_EXPIRED"); if (r.released) n++; } catch (e) { this.log.warn(e instanceof Error ? e.message : String(e)); } }
    return n;
  }
}
