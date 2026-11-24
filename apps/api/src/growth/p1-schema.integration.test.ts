import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  AcquisitionOrigin,
  AppointmentStatus,
  BookingSource,
  CommissionDecisionKind,
  CommissionDisputeReason,
  FeeType,
  Gender,
  ReferralLinkChannelKind,
  ReferralLinkOwnerScope,
  ReferralLinkStatus,
} from "@prisma/client";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, re);

/**
 * GRW-P1-D0: growth links and attribution schema (migration 20261128110000_growth_links_attribution). Real Postgres.
 * Proves: additive columns default to today's behaviour, enum addition, constraints, append-only decision trigger (with cascade-safe tenant removal),
 * tenant scoping columns, idempotent migration.
 */
describe("GRW-P1-D0 growth links and attribution schema", () => {
  const suffix = `d0-${Date.now()}`;
  let marketId: string;
  let tenantId: string;
  let otherTenantId: string;
  let clinicId: string;
  let otherClinicId: string;
  let clinicianId: string;
  let patientId: string;
  let appointmentId: string;
  let rateId: string;
  let codeSeq = 0;
  // Crockford base32 alphabet without I, L, O, U
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const nextCode = () => {
    codeSeq += 1;
    let n = (Date.now() % 1e9) * 1000 + codeSeq;
    let out = "";
    for (let i = 0; i < 8; i++) { out = ALPHABET[n % 32] + out; n = Math.floor(n / 32); }
    return out;
  };

  const mkClinic = (tenant: string, tag: string) =>
    prisma.clinic.create({
      data: {
        tenantId: tenant, nameEn: `Clinic ${tag}`, nameAr: "عيادة", country: "EG", city: "Cairo", addressEn: "St", addressAr: "شارع",
        locationUrl: "https://maps.example/c", phone: `+2010000${tag.slice(-5).replace(/\D/g, "0").padEnd(5, "0")}`, email: `c-${tag}@test.com`, licenseNumber: "SELF-SERVE-PENDING", defaultCurrency: "EGP",
      },
    });

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.create({
      data: { code: `D0${suffix}`.slice(0, 12), nameEn: `D0 market ${suffix}`, hostCell: "frankfurt", defaultCurrency: "EGP", defaultLocale: "en", defaultTimezone: "Africa/Cairo", weekendDays: [5, 6], enabledLanguages: ["en", "ar"], defaultPhoneRegion: "EG" },
    });
    marketId = market.id;
    tenantId = (await prisma.tenant.create({ data: { name: `D0 ${suffix}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" } })).id;
    otherTenantId = (await prisma.tenant.create({ data: { name: `D0 other ${suffix}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" } })).id;
    clinicId = (await mkClinic(tenantId, `${suffix}-a`)).id;
    otherClinicId = (await mkClinic(otherTenantId, `${suffix}-b`)).id;
    clinicianId = (await prisma.user.create({ data: { tenantId, email: `doc-${suffix}@test.com`, passwordHash: "x", displayName: "Doc", role: "PHYSICIAN" } })).id;
    patientId = (await prisma.patient.create({ data: { tenantId, mrn: `MRN-${suffix}`, firstNameEn: "Sam", lastNameEn: "New", gender: Gender.UNKNOWN, phone: `+2011${String(Date.now()).slice(-8)}`, nationalId: `nat-${suffix}` } })).id;
    rateId = (await prisma.kiorexCommissionRate.create({ data: { marketId, feeType: FeeType.FLAT, amount: 40, validFrom: new Date("2020-01-01") } })).id;
    appointmentId = (await prisma.appointment.create({ data: { tenantId, clinicId, patientId, clinicianId, startsAt: new Date(), feeAmount: 300, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatientAtBooking: true, status: AppointmentStatus.CONFIRMED } })).id;
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } }).catch(() => undefined);
    await prisma.kiorexCommissionRate.delete({ where: { id: rateId } }).catch(() => undefined);
    await prisma.market.delete({ where: { id: marketId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const link = (o: Record<string, unknown> = {}) =>
    prisma.providerReferralLink.create({ data: { tenantId, clinicId, code: nextCode(), label: "Reception QR", createdBy: clinicianId, ...o } as never });

  describe("additive Appointment columns and enums", () => {
    it("existing appointments keep today's behaviour: the three acquisition columns are null", async () => {
      const a = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
      assert.equal(a.acquisitionOrigin, null);
      assert.equal(a.acquisitionDecisionRef, null);
      assert.equal(a.acquisitionPolicyVersion, null);
      assert.equal(a.bookingSource, BookingSource.KIOREX_MARKETPLACE);
    });
    it("origin accepts the three contract values and nothing else", async () => {
      for (const o of [AcquisitionOrigin.PROVIDER_LED, AcquisitionOrigin.MARKETPLACE, AcquisitionOrigin.UNATTRIBUTED]) {
        const a = await prisma.appointment.update({ where: { id: appointmentId }, data: { acquisitionOrigin: o, acquisitionDecisionRef: "atd_1", acquisitionPolicyVersion: "agp_1" } });
        assert.equal(a.acquisitionOrigin, o);
      }
      await prisma.appointment.update({ where: { id: appointmentId }, data: { acquisitionOrigin: null, acquisitionDecisionRef: null, acquisitionPolicyVersion: null } });
      await rejects(prisma.$executeRawUnsafe(`UPDATE "Appointment" SET "acquisitionOrigin"='WHATEVER'::"AcquisitionOrigin" WHERE id='${appointmentId}'`), /invalid input value for enum/);
    });
    it("CommissionDisputeReason gained PROVIDER_LED_EVIDENCE and kept its four old values", () => {
      assert.deepEqual(Object.values(CommissionDisputeReason).sort(), ["DID_NOT_ATTEND", "DUPLICATE", "EXISTING_PATIENT", "OTHER", "PROVIDER_LED_EVIDENCE"]);
    });
    it("the migration touches no existing column: ADD COLUMN only on Appointment, no DROP or RENAME", () => {
      const sql = readFileSync(join(__dirname, "..", "..", "prisma", "migrations", "20261128110000_growth_links_attribution", "migration.sql"), "utf8");
      assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)\b/i);
      assert.doesNotMatch(sql, /RENAME/i);
      assert.doesNotMatch(sql, /ALTER TABLE "(?!Appointment")\w+" (DROP|ALTER COLUMN|ADD COLUMN)/i);
      assert.doesNotMatch(sql, /ALTER COLUMN/i);
    });
  });

  describe("ProviderReferralLink", () => {
    it("creates with defaults (ACTIVE, CLINIC, WEB_LINK) and a globally unique code", async () => {
      const l = await link();
      assert.equal(l.status, ReferralLinkStatus.ACTIVE);
      assert.equal(l.ownerScope, ReferralLinkOwnerScope.CLINIC);
      assert.equal(l.channelKind, ReferralLinkChannelKind.WEB_LINK);
      await rejects(prisma.providerReferralLink.create({ data: { tenantId: otherTenantId, clinicId: otherClinicId, code: l.code, label: "x", createdBy: "u" } }), /Unique constraint/);
    });
    it("code format: 8 Crockford base32 characters (no I, L, O, U, lowercase or other length)", async () => {
      for (const bad of ["7k2m9x4q", "7K2M9X4I", "7K2M9X4L", "7K2M9X4O", "7K2M9X4U", "7K2M9X4", "7K2M9X4QQ", ""]) {
        await rejects(link({ code: bad }), /code_format_check/);
      }
      await link({ code: "7K2M9X4Q" }).catch((e) => { if (!/Unique constraint/.test(String(e))) throw e; });
    });
    it("scope targets are required (DOCTOR needs a clinician, BRANCH a branch, DESK a desk label); label length is bounded", async () => {
      await rejects(link({ ownerScope: ReferralLinkOwnerScope.DOCTOR }), /scope_target_check/);
      await rejects(link({ ownerScope: ReferralLinkOwnerScope.BRANCH }), /scope_target_check/);
      await rejects(link({ ownerScope: ReferralLinkOwnerScope.DESK, channelKind: ReferralLinkChannelKind.QR_DESK }), /scope_target_check/);
      await link({ ownerScope: ReferralLinkOwnerScope.DOCTOR, clinicianId });
      await link({ ownerScope: ReferralLinkOwnerScope.DESK, deskLabel: "Desk 2", channelKind: ReferralLinkChannelKind.QR_DESK });
      await rejects(link({ label: "   " }), /label_check/);
      await rejects(link({ label: "x".repeat(81) }), /label_check/);
    });
    it("REVOKED requires revokedAt and the reverse", async () => {
      const l = await link();
      await rejects(prisma.providerReferralLink.update({ where: { id: l.id }, data: { status: ReferralLinkStatus.REVOKED } }), /revoked_check/);
      await rejects(prisma.providerReferralLink.update({ where: { id: l.id }, data: { revokedAt: new Date() } }), /revoked_check/);
      const r = await prisma.providerReferralLink.update({ where: { id: l.id }, data: { status: ReferralLinkStatus.REVOKED, revokedAt: new Date(), revokedBy: clinicianId } });
      assert.equal(r.status, ReferralLinkStatus.REVOKED);
    });
    it("tenant scoping: every row carries tenantId and a scoped query cannot see another tenant's links", async () => {
      const mine = await link();
      const theirs = await prisma.providerReferralLink.create({ data: { tenantId: otherTenantId, clinicId: otherClinicId, code: nextCode(), label: "Other", createdBy: "u" } });
      const seen = await prisma.providerReferralLink.findMany({ where: { tenantId } });
      assert.ok(seen.some((x) => x.id === mine.id));
      assert.ok(!seen.some((x) => x.id === theirs.id));
    });
    it("daily counters: one row per link and date, non-negative, counters only (no patient column)", async () => {
      const l = await link();
      const date = new Date("2027-03-04");
      await prisma.providerReferralLinkDaily.create({ data: { linkId: l.id, tenantId, date, visits: 12, bookings: 2, attended: 1 } });
      await rejects(prisma.providerReferralLinkDaily.create({ data: { linkId: l.id, tenantId, date } }), /Unique constraint/);
      await rejects(prisma.providerReferralLinkDaily.create({ data: { linkId: l.id, tenantId, date: new Date("2027-03-05"), visits: -1 } }), /counts_check/);
      const cols = (await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name='ProviderReferralLinkDaily'`).map((c) => c.column_name).sort();
      assert.deepEqual(cols, ["attended", "bookings", "date", "linkId", "tenantId", "updatedAt", "visits"]);
    });
    it("deleting a link cascades its counters", async () => {
      const l = await link();
      await prisma.providerReferralLinkDaily.create({ data: { linkId: l.id, tenantId, date: new Date("2027-04-01"), visits: 1 } });
      await prisma.providerReferralLink.delete({ where: { id: l.id } });
      assert.equal(await prisma.providerReferralLinkDaily.count({ where: { linkId: l.id } }), 0);
    });
  });

  describe("BookingWidgetConfig", () => {
    it("one config per clinic, disabled by default, https exact origins only, at most 10", async () => {
      const c = await prisma.bookingWidgetConfig.create({ data: { tenantId, clinicId, allowedOrigins: ["https://clinic.example.com", "https://www.nile-clinic.eg"] } });
      assert.equal(c.enabled, false);
      assert.equal(c.locale, "ar");
      await rejects(prisma.bookingWidgetConfig.create({ data: { tenantId: otherTenantId, clinicId } }), /Unique constraint/);
      for (const bad of ["http://clinic.example.com", "https://*.example.com", "https://example.com/path", "https://localhost", "https://EXAMPLE.com", 5]) {
        await rejects(prisma.bookingWidgetConfig.update({ where: { clinicId }, data: { allowedOrigins: [bad] } }), /origins_check/);
      }
      await rejects(prisma.bookingWidgetConfig.update({ where: { clinicId }, data: { allowedOrigins: Array.from({ length: 11 }, (_, i) => `https://c${i}.example.com`) } }), /origins_check/);
      await rejects(prisma.bookingWidgetConfig.update({ where: { clinicId }, data: { allowedOrigins: { not: "an array" } } }), /origins_check/);
      await prisma.bookingWidgetConfig.update({ where: { clinicId }, data: { allowedOrigins: Array.from({ length: 10 }, (_, i) => `https://c${i}.example.com`), enabled: true } });
      await rejects(prisma.bookingWidgetConfig.update({ where: { clinicId }, data: { locale: "fr" } }), /locale_check/);
    });
  });

  describe("KiorexCommissionDecision (append-only)", () => {
    const decision = (o: Record<string, unknown> = {}) =>
      prisma.kiorexCommissionDecision.create({
        data: { tenantId, clinicId, appointmentId, policyVersion: "agp_1", origin: AcquisitionOrigin.MARKETPLACE, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatient: true, decision: CommissionDecisionKind.CHARGE, reasonCodes: ["NEW_PATIENT", "KIOREX_CHANNEL"], rateId, amount: 40, currency: "EGP", inputsHash: sha("in1"), ...o } as never,
      });

    it("unique per appointment and policy version; a second policy version is a new row", async () => {
      const d = await decision();
      assert.equal(d.decision, CommissionDecisionKind.CHARGE);
      await rejects(decision(), /Unique constraint/);
      const d2 = await decision({ policyVersion: "agp_2", origin: AcquisitionOrigin.PROVIDER_LED, decision: CommissionDecisionKind.NO_CHARGE, reasonCodes: ["PROVIDER_LED"], rateId: null, amount: null });
      assert.equal(d2.decision, CommissionDecisionKind.NO_CHARGE);
      assert.equal(await prisma.kiorexCommissionDecision.count({ where: { appointmentId } }), 2);
    });

    it("UPDATE and DELETE are rejected, through Prisma and raw SQL", async () => {
      const d = await prisma.kiorexCommissionDecision.findFirstOrThrow({ where: { appointmentId, policyVersion: "agp_1" } });
      await rejects(prisma.kiorexCommissionDecision.update({ where: { id: d.id }, data: { decision: CommissionDecisionKind.WAIVED } }), /append-only/);
      await rejects(prisma.kiorexCommissionDecision.delete({ where: { id: d.id } }), /append-only/);
      await rejects(prisma.$executeRawUnsafe(`UPDATE "KiorexCommissionDecision" SET "amount"=0`), /append-only/);
      await rejects(prisma.$executeRawUnsafe(`DELETE FROM "KiorexCommissionDecision"`), /append-only/);
    });

    it("a PROVIDER_LED decision can never be a CHARGE; CHARGE needs a rate and an amount; NO_CHARGE carries no amount; hash is sha256 hex", async () => {
      await rejects(decision({ policyVersion: "x1", origin: AcquisitionOrigin.PROVIDER_LED }), /provider_led_check/);
      await rejects(decision({ policyVersion: "x2", rateId: null }), /charge_amount_check/);
      await rejects(decision({ policyVersion: "x3", amount: null }), /charge_amount_check/);
      await rejects(decision({ policyVersion: "x4", decision: CommissionDecisionKind.NO_CHARGE }), /charge_amount_check/);
      await rejects(decision({ policyVersion: "x5", inputsHash: "nothex" }), /hash_check/);
      await decision({ policyVersion: "x6", decision: CommissionDecisionKind.WAIVED, origin: AcquisitionOrigin.MARKETPLACE, reasonCodes: ["DISPUTE_UPHELD"] });
    });

    it("removing a tenant still works: the cascade from the appointment is allowed through the trigger, a direct delete is not", async () => {
      const t = await prisma.tenant.create({ data: { name: `D0 cascade ${suffix}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" } });
      const c = await mkClinic(t.id, `${suffix}-c`);
      const u = await prisma.user.create({ data: { tenantId: t.id, email: `doc2-${suffix}@test.com`, passwordHash: "x", displayName: "Doc2", role: "PHYSICIAN" } });
      const p = await prisma.patient.create({ data: { tenantId: t.id, mrn: `MRN2-${suffix}`, firstNameEn: "A", lastNameEn: "B", gender: Gender.UNKNOWN, phone: `+2012${String(Date.now()).slice(-8)}`, nationalId: `nat2-${suffix}` } });
      const a = await prisma.appointment.create({ data: { tenantId: t.id, clinicId: c.id, patientId: p.id, clinicianId: u.id, startsAt: new Date(), feeAmount: 100, bookingSource: BookingSource.FRONT_DESK, status: AppointmentStatus.CONFIRMED } });
      await prisma.kiorexCommissionDecision.create({ data: { tenantId: t.id, clinicId: c.id, appointmentId: a.id, policyVersion: "agp_1", origin: AcquisitionOrigin.UNATTRIBUTED, bookingSource: BookingSource.FRONT_DESK, isNewPatient: false, decision: CommissionDecisionKind.NO_CHARGE, reasonCodes: ["NOT_KIOREX_CHANNEL"], inputsHash: sha("in2") } });
      await rejects(prisma.$executeRawUnsafe(`DELETE FROM "KiorexCommissionDecision" WHERE "appointmentId"='${a.id}'`), /append-only/);
      await prisma.tenant.delete({ where: { id: t.id } });
      assert.equal(await prisma.kiorexCommissionDecision.count({ where: { appointmentId: a.id } }), 0);
    });
  });

  describe("migration", () => {
    it("running the SQL a second time is a no-op (idempotent)", async () => {
      const sql = readFileSync(join(__dirname, "..", "..", "prisma", "migrations", "20261128110000_growth_links_attribution", "migration.sql"), "utf8");
      const before = (await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_constraint`)[0].n;
      const { Client } = await import("pg");
      const url = new URL(process.env.DATABASE_URL!);
      url.searchParams.delete("schema");
      const client = new Client({ connectionString: url.toString() });
      await client.connect();
      try { await client.query(sql); } finally { await client.end(); }
      const after = (await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_constraint`)[0].n;
      assert.equal(after, before);
      const t = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='kiorex_commission_decision_immutable'`;
      assert.equal(t[0].n, 1);
    });
  });
});
