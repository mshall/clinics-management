import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  BillingInterval,
  EmploymentType,
  Gender,
  KiorlyInvoiceStatus,
  KiorlyLineType,
  PlanKey,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { legalAcceptancesPayload, requiredLegalForSignup } from "../legal/legal-catalog";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { MarketplaceListingService } from "../marketplace/marketplace-listing.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { ACTIVE_PRICE_WHERE } from "../plans/plans-active-prices";
import { createPrismaClient } from "../prisma/create-prisma-client";
import { PrismaService } from "../prisma/prisma.service";
import { BillingSeatService } from "./billing-seat.service";
import { DunningService } from "./dunning.service";
import { PlatformSubscriptionsService } from "./platform-subscriptions.service";
import { PlanComparisonService } from "./plan-comparison.service";
import { SubscriptionPolicyService } from "./subscription-policy.service";
import { SubscriptionRenewalService } from "./subscription-renewal.service";
import { SubscriptionService } from "./subscription.service";
import { SettlementService } from "../billing-platform/settlement.service";

const prisma = createPrismaClient();
const svc = prisma as unknown as PrismaService;
const legal = new LegalAcceptanceService(svc, new AuditService(svc));
const seats = new BillingSeatService(svc);
const subs = new SubscriptionService(svc, legal, seats);
const listings = new MarketplaceListingService(svc, new OutboxEventService(svc));
const renewal = new SubscriptionRenewalService(svc, subs, seats, listings, legal);
const dunning = new DunningService(svc, subs, listings, renewal);
const entitlements = new EntitlementsService(svc);
const compare = new PlanComparisonService(svc);
const platform = new PlatformSubscriptionsService(svc);
const policySvc = new SubscriptionPolicyService(svc);
const settlement = new SettlementService(svc, {} as never);
const DAY = 86_400_000;

describe("SUB-01 recurring subscription, auto-renew and Lite downgrade", () => {
  const suffix = `sub01-${Date.now()}`;
  let marketId: string;
  const created: { tenantIds: string[]; userIds: string[] } = { tenantIds: [], userIds: [] };

  before(async () => {
    process.env.PDPC_EGYPT_LAUNCH_GATE_BYPASS = "1";
    await prisma.$connect();
    marketId = (await prisma.market.findFirstOrThrow({ where: { code: "EG" } })).id;
  });
  after(async () => {
    for (const tenantId of created.tenantIds) {
      await prisma.outboxEvent.deleteMany({ where: { tenantId } });
      await prisma.kiorlyInvoice.deleteMany({ where: { tenantId } });
      await prisma.encounter.deleteMany({ where: { tenantId } });
      await prisma.patient.deleteMany({ where: { tenantId } });
      await prisma.employee.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.subscription.deleteMany({ where: { tenantId } });
      await prisma.clinic.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
    await prisma.$disconnect();
  });

  async function platformAdmin(label: string): Promise<JwtUser> {
    const u = await prisma.user.create({
      data: { tenantId: null, email: `plat-${label}-${suffix}@kiorex.test`, passwordHash: "x", displayName: `Plat ${label}`, role: UserRole.PLATFORM_SUPER_ADMIN },
    });
    created.userIds.push(u.id);
    return { userId: u.id, tenantId: null, email: u.email, role: UserRole.PLATFORM_SUPER_ADMIN, additionalRoles: [], sessionId: "t" };
  }

  type Fixture = { tenantId: string; owner: JwtUser; receptionist: JwtUser; physicianIds: string[]; patientId: string };

  async function seed(opts: { planKey?: PlanKey; periodEnd?: Date; autoRenew?: boolean; seats?: number; physicians?: number } = {}): Promise<Fixture> {
    const tag = `${suffix}-${created.tenantIds.length}`;
    const tenant = await prisma.tenant.create({ data: { name: `SUB01 ${tag}`, marketId, deploymentCell: "frankfurt" } });
    created.tenantIds.push(tenant.id);
    const clinic = await prisma.clinic.create({
      data: {
        tenantId: tenant.id, nameEn: "SUB01 Clinic", nameAr: "عيادة", country: "EG", city: "Cairo", addressEn: "1 St", addressAr: "1",
        locationUrl: "https://example.com", phone: "01000000001", email: `c-${tag}@test.local`, licenseNumber: `L-${tag}`,
      },
    });
    const hash = await bcrypt.hash("test-pass-12", 4);
    const mk = (role: UserRole, label: string, owner = false) =>
      prisma.user.create({ data: { tenantId: tenant.id, email: `${label}-${tag}@test.local`, passwordHash: hash, displayName: label, role, isTenantOwner: owner, billingSeatActive: true } });
    const ownerRow = await mk(UserRole.GROUP_ADMIN, "owner", true);
    const recRow = await mk(UserRole.RECEPTIONIST, "rec");
    const physicianIds: string[] = [];
    for (let i = 0; i < (opts.physicians ?? 3); i++) {
      const u = await mk(UserRole.PHYSICIAN, `doc${i}`);
      await prisma.employee.create({
        data: { tenantId: tenant.id, clinicId: clinic.id, userId: u.id, employeeNumber: `E-${tag}-${i}`, firstNameEn: "D", lastNameEn: `${i}`, phone: "0100", jobTitle: "Physician", employmentType: EmploymentType.FULL_TIME, hireDate: new Date(), salaryBase: 0, email: u.email },
      });
      physicianIds.push(u.id);
    }
    const planKey = opts.planKey ?? PlanKey.PRO;
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: planKey } });
    const price = await prisma.planPrice.findFirst({ where: { planId: plan.id, marketId, interval: BillingInterval.MONTHLY, ...ACTIVE_PRICE_WHERE() } });
    const now = new Date();
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id, planId: plan.id, planPriceId: price?.id ?? null, status: SubscriptionStatus.ACTIVE, interval: BillingInterval.MONTHLY,
        clinicianSeats: opts.seats ?? 3, currentPeriodStart: new Date((opts.periodEnd ?? new Date(now.getTime() + 20 * DAY)).getTime() - 30 * DAY),
        currentPeriodEnd: opts.periodEnd ?? new Date(now.getTime() + 20 * DAY), autoRenew: opts.autoRenew ?? true,
      },
    });
    await legal.recordMany(tenant.id, ownerRow.id, legalAcceptancesPayload(requiredLegalForSignup(PlanKey.PRO)));
    const patient = await prisma.patient.create({
      data: { tenantId: tenant.id, mrn: `M-${tag}`, homeBranchId: clinic.id, firstNameEn: "T", lastNameEn: "P", firstNameAr: "ت", lastNameAr: "ب", phone: `0109${tag.slice(-6)}`, gender: Gender.F, dob: new Date("1990-01-01") },
    });
    await prisma.encounter.create({ data: { tenantId: tenant.id, clinicId: clinic.id, clinicianId: physicianIds[0]!, patientId: patient.id, visitType: "OUTPATIENT", status: "DRAFT" } });
    const jwt = (u: { id: string; email: string; role: UserRole }, isOwner: boolean): JwtUser => ({ userId: u.id, tenantId: tenant.id, email: u.email, role: u.role, additionalRoles: [], isTenantOwner: isOwner, sessionId: "t" });
    return { tenantId: tenant.id, owner: jwt(ownerRow, true), receptionist: jwt(recRow, false), physicianIds, patientId: patient.id };
  }

  const subOf = (tenantId: string) => prisma.subscription.findUniqueOrThrow({ where: { tenantId }, include: { plan: true } });
  const eventCount = (subscriptionId: string, type: string) => prisma.subscriptionEvent.count({ where: { subscriptionId, type } });

  it("default: a new paid subscription renews automatically (auto-renew ON)", async () => {
    const f = await seed();
    const s = await subOf(f.tenantId);
    assert.equal(s.autoRenew, true);
    const state = await renewal.getRenewalState(f.owner, f.tenantId);
    assert.equal(state.autoRenew, true);
    assert.equal(state.willDowngradeAtPeriodEnd, false);
    assert.ok(state.renewsOn);
  });

  it("renew success: auto-renew ON at period end rolls the period once and stays on the paid plan", async () => {
    const f = await seed({ periodEnd: new Date(Date.now() - DAY) });
    const before = await subOf(f.tenantId);
    await renewal.runDaily();
    const after = await subOf(f.tenantId);
    assert.equal(after.plan.key, PlanKey.PRO);
    assert.equal(after.status, SubscriptionStatus.ACTIVE);
    assert.ok(after.currentPeriodEnd > new Date());
    assert.equal(after.currentPeriodStart.getTime(), before.currentPeriodEnd.getTime());
    assert.equal(await eventCount(after.id, "period_rolled"), 1);
  });

  it("idempotent under concurrency: 8 parallel scheduler runs roll the period exactly once and downgrade exactly once", async () => {
    const roll = await seed({ periodEnd: new Date(Date.now() - DAY) });
    const off = await seed({ periodEnd: new Date(Date.now() - DAY), autoRenew: false });
    await Promise.all(Array.from({ length: 8 }, () => renewal.runDaily()));
    const r = await subOf(roll.tenantId);
    const o = await subOf(off.tenantId);
    assert.equal(await eventCount(r.id, "period_rolled"), 1);
    assert.equal(r.plan.key, PlanKey.PRO);
    assert.equal(await eventCount(o.id, "downgraded_to_lite"), 1);
    assert.equal(o.plan.key, PlanKey.LITE);
    const notices = await prisma.outboxEvent.count({ where: { tenantId: off.tenantId, type: "billing.subscription_notice", payload: { path: ["kind"], equals: "downgraded_to_lite" } } });
    assert.equal(notices >= 1 && notices <= 2, true); // email (+ WhatsApp only when the owner has a phone), once
  });

  it("cancel auto-renew: stays on the paid plan until the period end, then Lite; data kept; seats over the Lite cap go read-only", async () => {
    const f = await seed();
    // The confirmation must come first and carries the impact.
    await assert.rejects(renewal.setAutoRenew(f.owner, f.tenantId, { enabled: false }), (e: any) => {
      assert.equal(e.getResponse().code, "AUTO_RENEW_CONFIRMATION_REQUIRED");
      assert.ok(e.getResponse().impact.lostFeatures.includes("mod_clinical"));
      assert.equal(e.getResponse().impact.dataRetained, true);
      return true;
    });
    assert.equal((await subOf(f.tenantId)).autoRenew, true);

    const state = await renewal.setAutoRenew(f.owner, f.tenantId, { enabled: false, confirmDowngrade: true });
    assert.equal(state.autoRenew, false);
    assert.equal(state.plan.key, PlanKey.PRO); // still the paid plan until the end of the period
    assert.ok(state.endsOn);
    assert.equal((await entitlements.resolve(f.tenantId)).entitlements.mod_clinical, true);

    // Period end arrives.
    await prisma.subscription.update({ where: { tenantId: f.tenantId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await renewal.runDaily();
    const s = await subOf(f.tenantId);
    assert.equal(s.plan.key, PlanKey.LITE);
    assert.equal(s.status, SubscriptionStatus.ACTIVE); // never CANCELLED / locked out
    assert.equal(s.downgradeReason, "auto_renew_off");
    assert.ok(s.liteReadOnlyGraceUntil && s.liteReadOnlyGraceUntil > new Date());
    assert.equal(s.previousPlanId != null, true);

    // Nothing was deleted.
    assert.equal(await prisma.patient.count({ where: { tenantId: f.tenantId } }), 1);
    assert.equal(await prisma.encounter.count({ where: { tenantId: f.tenantId } }), 1);
    // Lite caps clinicians at 2: the third physician is read-only, not deleted.
    const active = await prisma.user.count({ where: { tenantId: f.tenantId, role: UserRole.PHYSICIAN, billingSeatActive: true } });
    assert.equal(active, 2);
    assert.equal(await prisma.user.count({ where: { tenantId: f.tenantId, role: UserRole.PHYSICIAN } }), 3);
  });

  it("Lite entitlement enforcement: lost modules are read-only during the grace window, writes need an upgrade", async () => {
    const f = await seed();
    await renewal.downgradeToLite(f.tenantId, "platform_forced", null);
    const resolved = await entitlements.resolve(f.tenantId);
    assert.equal(resolved.plan.key, PlanKey.LITE);
    assert.equal(resolved.entitlements.mod_clinical, false);
    assert.ok(resolved.liteGrace?.readOnlyKeys.includes("mod_clinical"));
    await entitlements.requireEntitlement(f.tenantId, "mod_clinical", { readOnlyRequest: true }); // GET passes in grace
    await assert.rejects(entitlements.requireEntitlement(f.tenantId, "mod_clinical", { readOnlyRequest: false }), (e: any) => e.getStatus() === 402);
    // After the grace window the read access ends too (data still stored).
    await prisma.subscription.update({ where: { tenantId: f.tenantId }, data: { liteReadOnlyGraceUntil: new Date(Date.now() - 1000) } });
    await assert.rejects(entitlements.requireEntitlement(f.tenantId, "mod_clinical", { readOnlyRequest: true }), (e: any) => e.getStatus() === 402);
    assert.equal(await prisma.encounter.count({ where: { tenantId: f.tenantId } }), 1);
  });

  async function unpaidInvoice(tenantId: string, daysOverdue: number) {
    const dueAt = new Date(Date.now() - daysOverdue * DAY);
    const tag = `${suffix}-${tenantId.slice(-6)}`;
    await prisma.kiorlyInvoice.create({
      data: {
        tenantId, number: `INV-${tag}`, periodKey: `p-${tag}`, periodStart: new Date(dueAt.getTime() - 30 * DAY), periodEnd: new Date(dueAt.getTime() - DAY),
        currency: "EGP", status: KiorlyInvoiceStatus.ISSUED, dueAt, issuedAt: new Date(dueAt.getTime() - 7 * DAY), total: 999, subtotal: 999, tax: 0, amountPaid: 0,
        lines: { create: { type: KiorlyLineType.SUBSCRIPTION, descEn: "Pro", descAr: "برو", quantity: 1, unitAmount: 999, amount: 999 } },
      },
    });
  }

  it("renew failure -> dunning -> LITE (not READ_ONLY/SUSPENDED); warning the day before; payment later does not undo Lite", async () => {
    const f = await seed();
    await unpaidInvoice(f.tenantId, 10);
    await dunning.runForTenant(f.tenantId);
    assert.equal((await subOf(f.tenantId)).status, SubscriptionStatus.GRACE);
    assert.equal((await subOf(f.tenantId)).plan.key, PlanKey.PRO);

    await prisma.kiorlyInvoice.updateMany({ where: { tenantId: f.tenantId }, data: { dueAt: new Date(Date.now() - 14 * DAY) } });
    await dunning.runForTenant(f.tenantId);
    await dunning.runForTenant(f.tenantId); // idempotent
    const warn = await prisma.subscriptionEvent.count({ where: { subscriptionId: (await subOf(f.tenantId)).id, type: "lapse_notice_downgrade_warning" } });
    assert.equal(warn, 1);

    await prisma.kiorlyInvoice.updateMany({ where: { tenantId: f.tenantId }, data: { dueAt: new Date(Date.now() - 16 * DAY) } });
    await Promise.all([dunning.runForTenant(f.tenantId), dunning.runForTenant(f.tenantId), dunning.runForTenant(f.tenantId)]);
    const s = await subOf(f.tenantId);
    assert.equal(s.plan.key, PlanKey.LITE);
    assert.equal(s.status, SubscriptionStatus.ACTIVE);
    assert.equal(s.downgradeReason, "dunning_exhausted");
    assert.equal(await eventCount(s.id, "downgraded_to_lite"), 1);
    // A SUSPENDED/READ_ONLY lockout never happened.
    const statuses = await prisma.subscriptionEvent.findMany({ where: { subscriptionId: s.id, type: "status_changed" } });
    assert.equal(statuses.some((e) => ["READ_ONLY", "SUSPENDED"].includes(String((e.toJson as any)?.status))), false);
  });

  it("reactivate: Lite -> previous paid plan in one step, auto-renew back to the market default, grace cleared", async () => {
    const f = await seed();
    await renewal.downgradeToLite(f.tenantId, "auto_renew_off", null);
    const state = await renewal.getRenewalState(f.owner, f.tenantId);
    assert.equal(state.canReactivate, true);
    assert.equal(state.previousPlan?.key, PlanKey.PRO);
    const res = await renewal.reactivate(f.owner, f.tenantId, {});
    assert.equal(res.reactivated, true);
    assert.equal(res.needsPaymentMethod, true);
    const s = await subOf(f.tenantId);
    assert.equal(s.plan.key, PlanKey.PRO);
    assert.equal(s.autoRenew, true);
    assert.equal(s.downgradedToLiteAt, null);
    assert.equal(s.liteReadOnlyGraceUntil, null);
    assert.equal(s.clinicianSeats, 3);
    assert.equal((await entitlements.resolve(f.tenantId)).entitlements.mod_clinical, true);
    await assert.rejects(renewal.reactivate(f.owner, f.tenantId, {}), (e: any) => e.getResponse().code === "ALREADY_PAID");
  });

  it("security: only owner/admin changes auto-renew; other tenants and platform force are enforced", async () => {
    const a = await seed();
    const b = await seed();
    await assert.rejects(renewal.setAutoRenew(a.receptionist, a.tenantId, { enabled: false, confirmDowngrade: true }), (e: any) => e.getStatus() === 403);
    await assert.rejects(renewal.setAutoRenew(a.owner, b.tenantId, { enabled: false, confirmDowngrade: true }), (e: any) => e.getStatus() === 403);
    await assert.rejects(renewal.getRenewalState(a.owner, b.tenantId), (e: any) => e.getStatus() === 403);
    await assert.rejects(renewal.reactivate(a.owner, b.tenantId, {}), (e: any) => e.getStatus() === 403);
    await assert.rejects(compare.compare(a.owner, b.tenantId), (e: any) => e.getStatus() === 403);
    // Only platform super admins can force; a tenant owner cannot.
    await assert.rejects(renewal.platformForceAutoRenew(a.owner, a.tenantId, "OFF", "x"), (e: any) => e.getStatus() === 403);
    await assert.rejects(platform.list(a.owner, {}), (e: any) => e.getStatus() === 403);
    const admin = await platformAdmin("a");
    await assert.rejects(renewal.platformForceAutoRenew(admin, a.tenantId, "ON", "  "), (e: any) => e.getStatus() === 400);
    await renewal.platformForceAutoRenew(admin, a.tenantId, "ON", "contractual: annual commitment");
    await assert.rejects(renewal.setAutoRenew(a.owner, a.tenantId, { enabled: false, confirmDowngrade: true }), (e: any) => e.getResponse().code === "AUTO_RENEW_FORCED");
    const state = await renewal.getRenewalState(a.owner, a.tenantId);
    assert.equal(state.canChangeAutoRenew, false);
    assert.equal(state.autoRenewForced, "ON");
    const audit = await prisma.auditLog.count({ where: { tenantId: a.tenantId, action: "subscription.auto_renew_forced" } });
    assert.equal(audit, 1);
    // Forced OFF + period end => Lite even though the org flag is true.
    await renewal.platformForceAutoRenew(admin, a.tenantId, "OFF", "customer request by phone");
    await prisma.subscription.update({ where: { tenantId: a.tenantId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await renewal.runDaily();
    assert.equal((await subOf(a.tenantId)).plan.key, PlanKey.LITE);
  });

  it("reminders: sent once per offset per period, deferred out of quiet hours, nothing for Lite", async () => {
    const f = await seed({ periodEnd: new Date(Date.now() + 2.5 * DAY) });
    await renewal.runDaily();
    await renewal.runDaily();
    const sent = await prisma.outboxEvent.findMany({ where: { tenantId: f.tenantId, type: "billing.subscription_notice" } });
    const kinds = sent.map((e) => (e.payload as any).kind);
    assert.deepEqual([...new Set(kinds)], ["payment_method_missing"]); // no saved method yet -> the useful reminder
    assert.equal(sent.filter((e) => (e.payload as any).channel === "email").length, 1);
    for (const e of sent) {
      const h = (e.nextAttemptAt.getUTCHours() + 2) % 24;
      assert.equal(h >= 21 || h < 8, false, `reminder scheduled in quiet hours (${h})`);
    }
    const lite = await seed({ planKey: PlanKey.LITE, periodEnd: new Date(Date.now() + DAY) });
    await renewal.runDaily();
    assert.equal(await prisma.outboxEvent.count({ where: { tenantId: lite.tenantId, type: "billing.subscription_notice" } }), 0);
  });

  it("plan comparison: values come from the catalog; downgrade impact vs current plan; no invented prices", async () => {
    const f = await seed();
    const cmp = await compare.compare(f.owner, f.tenantId);
    assert.deepEqual(cmp.plans.map((p) => p.key), [PlanKey.LITE, PlanKey.PRO, PlanKey.CLINIC]);
    const lite = cmp.plans.find((p) => p.key === PlanKey.LITE)!;
    assert.equal(lite.relation, "DOWNGRADE");
    assert.ok(lite.downgradeImpact?.lostFeatures.includes("mod_clinical"));
    assert.equal(lite.downgradeImpact?.reducedLimits.find((l) => l.key === "max_clinicians")?.current, 3);
    assert.equal(cmp.plans.find((p) => p.key === PlanKey.PRO)!.relation, "CURRENT");
    const db = await prisma.planPrice.findFirstOrThrow({ where: { plan: { key: PlanKey.CLINIC }, marketId, interval: "MONTHLY", ...ACTIVE_PRICE_WHERE() } });
    assert.equal(cmp.plans.find((p) => p.key === PlanKey.CLINIC)!.prices.find((p) => p.interval === "MONTHLY")?.amount, db.amount.toString());
  });

  it("platform ops: list, MRR/churn-lite/downgrade counts, maker-checker policy", async () => {
    const f = await seed();
    await renewal.downgradeToLite(f.tenantId, "platform_forced", null);
    const admin = await platformAdmin("m");
    const checker = await platformAdmin("c");
    const list = await platform.list(admin, { planKey: "LITE", q: suffix });
    assert.ok(list.items.some((i) => i.tenantId === f.tenantId && i.downgradeReason === "platform_forced"));
    const m = await platform.metrics(admin, 30);
    assert.ok(m.downgradesToLite >= 1);
    assert.ok((m.downgradesByReason.platform_forced ?? 0) >= 1);
    assert.ok(m.churnLite > 0 && m.churnLite <= 1);

    const current = await policySvc.get(admin, marketId);
    const next = { ...current.policy, downgradeAfterDays: 21, liteReadOnlyGraceDays: 45 };
    const change = await policySvc.propose(admin, marketId, { policy: next, reason: "SUB-01 test (values are NEEDS_HUMAN)" });
    await assert.rejects(policySvc.decide(admin, change.id, { approve: true }), (e: any) => e.getResponse().code === "MAKER_CANNOT_APPROVE");
    await assert.rejects(policySvc.propose(admin, marketId, { policy: { ...next, downgradeAfterDays: 3 }, reason: "invalid: below grace" }), (e: any) => e.getStatus() === 400);
    await policySvc.decide(checker, change.id, { approve: true, note: "ok" });
    const after = await policySvc.get(admin, marketId);
    assert.equal(after.policy.downgradeAfterDays, 21);
    assert.equal((await renewal.loadPolicy(f.tenantId)).liteReadOnlyGraceDays, 45);
    await assert.rejects(policySvc.decide(checker, change.id, { approve: true }), (e: any) => e.getResponse().code === "ALREADY_DECIDED");
    // restore
    const back = await policySvc.propose(admin, marketId, { policy: current.policy, reason: "restore" });
    await policySvc.decide(checker, back.id, { approve: true });
    assert.equal((await policySvc.get(admin, marketId)).policy.downgradeAfterDays, current.policy.downgradeAfterDays);
  });

  it("billing: the month in which auto-renew-off ends the paid term still bills the paid plan; the next month does not", async () => {
    const f = await seed();
    const admin = await platformAdmin("s");
    const now = new Date();
    const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    await renewal.downgradeToLite(f.tenantId, "auto_renew_off", null, now);
    const thisMonth = await settlement.previewForTenant(admin, f.tenantId, key(now));
    assert.ok(thisMonth.calculation.lines.some((l) => l.type === KiorlyLineType.SUBSCRIPTION), "paid-through month bills the subscription");
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15));
    const nextMonth = await settlement.previewForTenant(admin, f.tenantId, key(next));
    assert.equal(nextMonth.calculation.lines.some((l) => l.type === KiorlyLineType.SUBSCRIPTION), false, "Lite pays no subscription");
    // A dunning downgrade is not billed forward.
    const g = await seed();
    await renewal.downgradeToLite(g.tenantId, "dunning_exhausted", null, now);
    const gm = await settlement.previewForTenant(admin, g.tenantId, key(now));
    assert.equal(gm.calculation.lines.some((l) => l.type === KiorlyLineType.SUBSCRIPTION), false);
  });
});
