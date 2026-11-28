import * as bcrypt from "bcryptjs";
import { createPrismaClient } from "../../../api/src/prisma/create-prisma-client";

/**
 * Self-contained, self-cleaning Playwright fixtures for the Clinic specs that used to depend on hand-made data in a shared demo organisation.
 * Each call creates its OWN organisation (tenant, clinic, users, and only the rows the spec needs) in the PRIVATE database the stack runs on and removes it again.
 *
 * Safety: it refuses to run unless DATABASE_URL points at a local PRIVATE database (name starts with gap_, e2e_ or test_). It never touches the shared kiorly / kiorex / pharmacy / lab databases.
 *   DATABASE_URL=postgresql://…/gap_clinic_cap  npx playwright test …   (the same URL the API under test uses)
 */
const PRIVATE_DB = /^(gap_|e2e_|test_)[a-z0-9_]+$/;
export function assertPrivateDatabase(url = process.env.DATABASE_URL): string {
  if (!url) throw new Error("DATABASE_URL is not set: the fixtures need the PRIVATE database the stack under test runs on");
  const u = new URL(url);
  const name = u.pathname.replace(/^\//, "");
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname) || !PRIVATE_DB.test(name)) throw new Error(`Refusing to create fixtures in "${name}" on ${u.hostname}: only a local private database named gap_*, e2e_* or test_* is allowed`);
  return name;
}

export type Org = { tenantId: string; clinicId: string; admin: string; finance: string; reception: string; password: string; ids: { marketId: string } };
export type Fixtures = Awaited<ReturnType<typeof provisionOrg>>;

const day = 86_400_000;
const PASSWORD = "demo";

export async function provisionOrg(opts: { credit?: boolean; bookableVisitType?: boolean; commission?: boolean; /** COM-3: "set" = Kiorex wording, counsel status, parameters, a cash charge, a dispute and a payout; "unset" = wording not set. Default none. */ com3?: "set" | "unset" }) {
  assertPrivateDatabase();
  const prisma = createPrismaClient();
  await prisma.$connect();
  const sfx = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const hash = bcrypt.hashSync(PASSWORD, 8);
  const market = await prisma.market.create({ data: { code: `F${sfx}`.toUpperCase().slice(0, 8), nameEn: `Fixture ${sfx}`, hostCell: "frankfurt", defaultCurrency: "EGP", defaultLocale: "en", defaultTimezone: "Africa/Cairo", weekendDays: [5, 6], enabledLanguages: ["en", "ar"], defaultPhoneRegion: "EG" } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { key: "PRO" } });
  const tenant = await prisma.tenant.create({ data: { name: `Fixture ${sfx}`, deploymentCell: "frankfurt", marketId: market.id, baseCurrency: "EGP" } });
  const clinic = await prisma.clinic.create({ data: { tenantId: tenant.id, nameEn: "Fixture clinic", nameAr: "عيادة الاختبار", country: "EG", city: "Cairo", addressEn: "Street", addressAr: "شارع", locationUrl: "https://maps.example/fx", timezone: "Africa/Cairo", phone: "201000000077", email: `fx.${sfx}@example.com`, licenseNumber: "EG-FX", defaultCurrency: "EGP", marketplaceBookingAutoConfirm: true } });
  await prisma.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: "ACTIVE", interval: "MONTHLY", clinicianSeats: 3, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * day) } });
  const mk = (role: "GROUP_ADMIN" | "FINANCE_OFFICER" | "RECEPTIONIST" | "PHYSICIAN", n: string, owner = false) =>
    prisma.user.create({ data: { tenantId: tenant.id, email: `${n}.${sfx}@example.com`, passwordHash: hash, displayName: `Fixture ${n}`, role, isTenantOwner: owner } });
  const admin = await mk("GROUP_ADMIN", "admin", true); const finance = await mk("FINANCE_OFFICER", "finance"); const reception = await mk("RECEPTIONIST", "reception"); const doctor = await mk("PHYSICIAN", "doctor");

  if (opts.bookableVisitType) {
    await prisma.appointmentType.create({ data: { tenantId: tenant.id, clinicId: clinic.id, nameEn: "Visit", nameAr: "كشف", durationMinutes: 30, feeAmount: 300, colorHex: "#3b82f6", marketplaceBookable: true, minNoticeMinutes: 0, maxDaysAhead: 60, isActive: true } });
  }

  if (opts.credit) {
    // four lots of different categories (one of 150 expiring in 12 days -> the expiry banner), one consumption -> history; balance = sum of what is left
    const wallet = await prisma.creditWallet.create({ data: { tenantId: tenant.id, currency: "EGP", balance: 0 } });
    const lots = [
      { reason: "KIOREX_LATE_REVERSAL", category: "SERVICE_RECOVERY", amount: 150, days: 12 },
      { reason: "ONBOARDING", category: "ONBOARDING", amount: 200, days: 300 },
      { reason: "REFERRAL", category: "REFERRAL", amount: 100, days: 200 },
      { reason: "CONNECT_BONUS", category: "PROMOTIONAL", amount: 75, days: 100 },
    ] as const;
    let balance = 0;
    for (const l of lots) {
      await prisma.creditLedgerEntry.create({ data: { walletId: wallet.id, type: "GRANT", reason: l.reason, amount: l.amount, remaining: l.amount, expiresAt: new Date(Date.now() + l.days * day), category: l.category, createdBy: admin.id, note: "fixture", idempotencyKey: `fx:${sfx}:${l.reason}` } });
      balance += l.amount;
    }
    await prisma.creditLedgerEntry.create({ data: { walletId: wallet.id, type: "CONSUME", reason: "SUBSCRIPTION_OFFSET", amount: -25, remaining: null, createdBy: admin.id, note: "fixture", idempotencyKey: `fx:${sfx}:consume` } });
    await prisma.creditLedgerEntry.updateMany({ where: { walletId: wallet.id, reason: "ONBOARDING", type: "GRANT" }, data: { remaining: 175 } });
    await prisma.creditWallet.update({ where: { id: wallet.id }, data: { balance: balance - 25, version: 5 } });
  }

  let chargeId: string | null = null;
  if (opts.commission) {
    const patient = await prisma.patient.create({ data: { tenantId: tenant.id, mrn: `FX-${sfx}`, firstNameEn: "Sam", lastNameEn: "New", gender: "UNKNOWN", phone: `+2011${String(Math.random()).slice(2, 10)}`, nationalId: `fx-${sfx}` } });
    const apt = await prisma.appointment.create({ data: { tenantId: tenant.id, clinicId: clinic.id, patientId: patient.id, clinicianId: doctor.id, startsAt: new Date(), feeAmount: 300, bookingSource: "KIOREX_MARKETPLACE", isNewPatientAtBooking: true, status: "CONFIRMED" } });
    const rate = await prisma.kiorexCommissionRate.create({ data: { marketId: market.id, feeType: "FLAT", amount: 120, validFrom: new Date("2020-01-01") } });
    const attended = new Date(); attended.setUTCDate(10); attended.setUTCHours(10, 0, 0, 0);
    const charge = await prisma.kiorexCommissionCharge.create({ data: { tenantId: tenant.id, clinicId: clinic.id, appointmentId: apt.id, patientId: patient.id, clinicianId: doctor.id, rateId: rate.id, amount: 120, currency: "EGP", status: "CONFIRMED", attendedAt: attended, confirmedAt: new Date(attended.getTime() + 2 * 3_600_000), disputeDeadline: new Date(attended.getTime() + 7 * day) } });
    chargeId = charge.id;
    await prisma.kiorexCommissionDecision.create({ data: { tenantId: tenant.id, clinicId: clinic.id, appointmentId: apt.id, policyVersion: "CP1@base", origin: "MARKETPLACE", bookingSource: "KIOREX_MARKETPLACE", isNewPatient: true, decision: "CHARGE", reasonCodes: ["NEW_PATIENT"], rateId: rate.id, amount: 120, currency: "EGP", inputsHash: "a".repeat(64), feeBasisMinor: 30000, sponsoredDiscountMinor: 5000, basisPolicyVersion: "BP1" } });
    await prisma.kiorexCommissionCollection.create({ data: { tenantId: tenant.id, runRef: `crn_fx_${sfx}`, periodKey: new Date().toISOString().slice(0, 7) + "-05", status: "COLLECTED", mode: "AUTO_CHARGE_SAVED_METHOD", modeRequested: "AUTO_CHARGE_SAVED_METHOD", provider: "paymob", currency: "EGP", claimsCount: 1, claimsMinor: 12000, collectedMinor: 12000, version: BigInt(100), claims: [{ chargeId: charge.id, amountMinor: 12000, collectedMinor: 12000, collectionStatus: "COLLECTED", ...(opts.com3 ? { disputeStatus: "OPEN", disputeDeadline: new Date(Date.now() + 9 * day).toISOString(), tender: "CASH", rateSource: "DEFAULT", rateSnapshot: { source: "DEFAULT", version: 3, spec: { feeType: "FLAT", flatMinor: 12000 } } } : {}) }], attempts: [{ attemptNo: 1, kind: "CHARGE", status: "SUCCEEDED", amountMinor: 12000 }], timeline: [{ at: new Date().toISOString(), event: "CHARGE_SUCCEEDED", by: "system" }] } });
  }

  if (opts.commission) {
    // COM-2: what Kiorex reports for this organisation (a default and, from last month, its own rate agreed with Kiorex)
    const params = opts.com3 === "set" ? { disputeWindowDays: 9, invoiceDueDays: 11, graceDays: 6, retryDays: [2, 6], reminderDays: [-4, 0], savedMethodChargeAllowed: false } : {};
    const spec = (o: object) => ({ feeType: "PERCENT", percentBps: 1250, flatMinor: null, minMinor: 500, maxMinor: 9000, mode: null, ...o });
    await prisma.kiorexCommissionRateView.create({ data: { tenantId: tenant.id, product: "CLINIC", version: BigInt(Date.now()), view: { mode: null, history: [
      { version: 1, scope: "DEFAULT", kind: "RATE", effectiveFrom: "2026-01-01T00:00:00.000Z", reason: null, spec: spec(params) },
      { version: 1, scope: "ORG", kind: "RATE", effectiveFrom: "2026-02-01T00:00:00.000Z", reason: "volume agreement", spec: spec({ feeType: "FLAT", percentBps: null, flatMinor: 4000, minMinor: null, maxMinor: null, mode: "NET_FROM_PAYOUT", ...params }) },
    ], ...(opts.com3 === "set" ? {
      disclosure: { rateDisclosure: { en: "TEST rate disclosure written by Kiorex", ar: "نص تجريبي للإفصاح عن النسبة كتبته كيوريكس" }, termsSummary: { en: "TEST terms summary", ar: "" }, showOverrideReason: true, wordingSet: true },
      counsel: { status: "APPROVED_WITH_CONDITIONS" },
    } : opts.com3 === "unset" ? { disclosure: { rateDisclosure: { en: "", ar: "" }, termsSummary: { en: "", ar: "" }, showOverrideReason: false, wordingSet: false }, counsel: { status: "NOT_REVIEWED" } } : {}) } } });
    if (opts.com3) await prisma.kiorexPayout.create({ data: { tenantId: tenant.id, clinicId: clinic.id, payoutRef: `po-fx-${sfx}`, amount: 80, currency: "EGP", paidAt: new Date(), commissionDeducted: 40 } });
    if (opts.com3) await prisma.kiorexCommissionCharge.update({ where: { id: chargeId! }, data: { tender: "CASH" } });
  }

  const org: Org = { tenantId: tenant.id, clinicId: clinic.id, admin: admin.email, finance: finance.email, reception: reception.email, password: PASSWORD, ids: { marketId: market.id } };

  /** Remove everything the fixture created. Append-only ledger triggers are suspended for the delete only (private database; the tables are re-armed in the same transaction). */
  async function cleanup() {
    try {
      await prisma.$transaction(async (tx) => {
        const guarded = ["CreditLedgerEntry", "AuditLog", "KiorexCommissionDecision", "KiorexCommissionCharge", "KiorexCommissionCollection"];
        for (const t of guarded) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`);
        await tx.tenant.delete({ where: { id: tenant.id } });
        if (chargeId) await tx.kiorexCommissionRate.deleteMany({ where: { marketId: market.id } });
        await tx.market.delete({ where: { id: market.id } });
        for (const t of guarded) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER USER`);
      }, { timeout: 60_000 });
    } finally {
      await prisma.$disconnect();
    }
  }
  return { org, cleanup, prisma };
}
