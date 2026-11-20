import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { PhysioService } from "./physio.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const queued: { body: string; templateKey?: string; variables?: Record<string, string> }[] = [];
const messaging = { queueMessage: async (_t: string, m: never) => (queued.push(m), { id: "msg1", status: "QUEUED" }) };
const svc = new PhysioService(prisma as unknown as PrismaService, new AuditService(prisma as unknown as PrismaService), messaging as never);

describe("CL07-PT physio pack (integration)", () => {
  const suffix = `${Date.now()}`;
  let tenantId: string, patientId: string, clinicId: string, marketId: string, user: JwtUser, original: unknown;

  before(async () => {
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    marketId = market.id;
    original = market.clinicalConfig;
    const tenant = await prisma.tenant.create({
      data: { name: `Physio ${suffix}`, deploymentCell: "frankfurt", marketId, clinics: { create: { nameEn: "PT Clinic", nameAr: "عيادة العلاج", country: "EG", city: "Cairo", addressEn: "S", addressAr: "ش", locationUrl: "https://m.example/x", phone: "201000000077", email: `physio.${suffix}@example.com`, licenseNumber: "EG-PT", defaultCurrency: "EGP" } } },
      include: { clinics: true },
    });
    tenantId = tenant.id;
    clinicId = tenant.clinics[0]!.id;
    const u = await prisma.user.create({ data: { tenantId, email: `pt.${suffix}@example.com`, passwordHash: "x", displayName: "PT", role: UserRole.PHYSICIAN, profession: "PHYSIOTHERAPIST" } });
    user = { userId: u.id, tenantId, email: u.email, role: UserRole.PHYSICIAN, additionalRoles: [] };
    const p = await prisma.patient.create({ data: { tenantId, firstNameEn: "Sara", lastNameEn: "Hassan", firstNameAr: "سارة", lastNameAr: "حسن", phone: "201001112223", mrn: `PT-${suffix}`, dob: new Date("1990-01-01"), gender: "F" } });
    patientId = p.id;
  });

  after(async () => {
    await prisma.market.update({ where: { id: marketId }, data: { clinicalConfig: original as never } });
    for (const m of ["physioHepLink", "physioProgressNote", "physioOutcomeMeasure", "physioTreatmentPlan", "physioAssessment", "physioReferral"] as const) await (prisma[m] as any).deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.patient.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  let planId: string;
  const programme = [{ nameEn: "Quad set", nameAr: "شد الفخذ", sets: 3, reps: 10 }];

  it("PT02/PT04: a plan needs a referral unless the market pack allows direct access", async () => {
    const base = { patientId, clinicId, sessionCount: 3, frequencyPerWeek: 2 };
    await assert.rejects(() => svc.createPlan(tenantId, user, base), (e: any) => e.getResponse().errorCode === "PHYSIO_REFERRAL_REQUIRED");
    await assert.rejects(() => svc.createReferral(tenantId, user, { patientId, source: "DIRECT_ACCESS" }), (e: any) => e.getResponse().errorCode === "PHYSIO_DIRECT_ACCESS_NOT_ALLOWED");
    await assert.rejects(() => svc.receiveReferral(tenantId, { patientId, externalRef: `r-${suffix}`, referringDoctorName: "Dr X" }), (e: any) => e.getResponse().errorCode === "PHYSIO_REFERRAL_NO_CONSENT");
    const received = await svc.receiveReferral(tenantId, { patientId, externalRef: `r-${suffix}`, referringDoctorName: "Dr X", consentToken: "tok" });
    assert.equal((await svc.receiveReferral(tenantId, { patientId, externalRef: `r-${suffix}`, referringDoctorName: "Dr X", consentToken: "tok" })).id, received.id, "idempotent");
    const attached = await svc.createReferral(tenantId, user, { patientId, source: "ATTACHED_DOCUMENT", referringDoctorName: "Dr Y" });
    const plan: any = await svc.createPlan(tenantId, user, { ...base, referralId: attached.id, homeProgramme: programme });
    planId = plan.id;
    assert.deepEqual([plan.sessionCount, plan.sessionsRemaining], [3, 3]);
    await prisma.market.update({ where: { id: marketId }, data: { clinicalConfig: { ...(original as object), physioDirectAccess: true } } });
    const direct = await svc.createReferral(tenantId, user, { patientId, source: "DIRECT_ACCESS" });
    assert.equal(direct.source, "DIRECT_ACCESS");
    await prisma.market.update({ where: { id: marketId }, data: { clinicalConfig: original as never } });
  });

  it("PT01 assessment writes baseline outcomes; PT03 notes count sessions, chart the trend and stop at the plan size", async () => {
    await svc.createAssessment(tenantId, user, { patientId, complaint: "Knee pain", painNrs: 8, rom: [{ joint: "knee", movement: "flexion", degrees: 90 }], functionalGoals: [{ text: "Stairs" }] });
    const n1 = await svc.addProgressNote(tenantId, user, planId, { subjective: "better", outcomes: [{ kind: "PAIN_NRS", label: "pain", value: 6, unit: "0-10" }, { kind: "ROM", label: "knee_flexion", value: 105, unit: "deg" }] });
    assert.deepEqual([n1.sessionsCompleted, n1.sessionsRemaining], [1, 2]);
    await svc.addProgressNote(tenantId, user, planId, { outcomes: [{ kind: "PAIN_NRS", label: "pain", value: 3, unit: "0-10" }] });
    const t = await svc.trend(tenantId, patientId, "PAIN_NRS", "pain");
    assert.deepEqual([t.first, t.latest, t.change, t.points.length], [8, 3, -5, 3]);
    await svc.addProgressNote(tenantId, user, planId, {});
    await assert.rejects(() => svc.addProgressNote(tenantId, user, planId, {}), (e: any) => e.getResponse().errorCode === "PHYSIO_SESSIONS_EXHAUSTED");
    await assert.rejects(() => svc.addProgressNote(tenantId, user, planId, { outcomes: [{ kind: "PAIN_NRS", label: "pain", value: 11, unit: "x" }] }));
  });

  it("PT05: the WhatsApp message carries clinic + link only (no PHI); the public page has no patient data", async () => {
    const res = await svc.shareHomeProgramme(tenantId, user, planId);
    const m = queued[0]!;
    assert.equal(m.templateKey, "physio_hep_link");
    assert.deepEqual(Object.keys(m.variables!).sort(), ["clinic", "link"]);
    for (const banned of ["Sara", "Hassan", "201001112223", "Knee"]) assert.ok(!m.body.includes(banned) && !JSON.stringify(m.variables).includes(banned), banned);
    const token = decodeURIComponent(res.link.split("/hep/")[1]!);
    const pub = await svc.publicHomeProgramme(token);
    assert.equal(pub.clinicNameEn, "PT Clinic");
    const json = JSON.stringify(pub);
    for (const banned of ["Sara", "Hassan", "201001112223", "Knee", "patientId"]) assert.ok(!json.includes(banned), banned);
    await assert.rejects(() => svc.publicHomeProgramme("nope"));
  });

  it("discharge closes the plan with a summary; closed plans take no more notes", async () => {
    await assert.rejects(() => svc.discharge(tenantId, user, planId, " "));
    const d: any = await svc.discharge(tenantId, user, planId, "Goals met");
    assert.equal(d.status, "DISCHARGED");
    await assert.rejects(() => svc.addProgressNote(tenantId, user, planId, {}), (e: any) => e.getResponse().errorCode === "PHYSIO_PLAN_CLOSED");
  });
});
