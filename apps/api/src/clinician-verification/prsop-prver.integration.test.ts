import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaClient, Profession, UserRole, VerificationStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { LocalUploadBlobStorage } from "../storage/local-upload-blob.storage";
import { ClinicianVerificationService } from "./clinician-verification.service";
import { ProfessionReverificationService } from "./profession-reverification.service";
import { applyReverification } from "./reverify";
import { tenantHasVerifiedPhysician } from "./kiorex-marketplace-gate";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const uploads = new LocalUploadBlobStorage(path.join(process.cwd(), "uploads"));
const audit = new AuditService(prisma as unknown as PrismaService);
const service = new ClinicianVerificationService(prisma as unknown as PrismaService, uploads, audit);
const reverify = new ProfessionReverificationService(prisma as unknown as PrismaService, audit);

const PDF = { buffer: Buffer.from("%PDF-1.4 x"), mimetype: "application/pdf", originalname: "d.pdf", size: 10 };

describe("PRSOP01 backfill + PRVER01-04 (profession verification)", () => {
  const suffix = `${Date.now()}`;
  let tenantId: string;
  let admin: JwtUser;
  let platform: JwtUser;
  const users: Record<string, { id: string; jwt: JwtUser }> = {};

  async function mkUser(key: string, role: UserRole, profession: Profession | null, displayName = `Dr ${key}`) {
    const u = await prisma.user.create({
      data: { tenantId, email: `prsop.${key}.${suffix}@example.com`, passwordHash: bcrypt.hashSync("demo", 10), displayName, role, profession, isTenantOwner: key === "admin" },
    });
    users[key] = { id: u.id, jwt: { userId: u.id, tenantId, email: u.email, role, additionalRoles: [], isTenantOwner: u.isTenantOwner } };
    return u;
  }

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Prsop ${suffix}`,
        deploymentCell: "frankfurt",
        marketId: market.id,
        clinics: {
          create: { nameEn: "C", nameAr: "ع", country: "EG", city: "Cairo", addressEn: "S", addressAr: "ش", locationUrl: "https://maps.example/x", phone: "201000000009", email: `prsop.${suffix}@example.com`, licenseNumber: "EG-PRSOP", defaultCurrency: "EGP" },
        },
      },
    });
    tenantId = tenant.id;
    await mkUser("admin", UserRole.CLINIC_ADMIN, null, "Admin");
    admin = users.admin!.jwt;
    const pu = await prisma.user.create({ data: { tenantId: null, email: `prsop.platform.${suffix}@kiorly.test`, passwordHash: "x", displayName: "Platform", role: UserRole.PLATFORM_SUPER_ADMIN } });
    platform = { userId: pu.id, tenantId: null, email: pu.email, role: UserRole.PLATFORM_SUPER_ADMIN, additionalRoles: [] };
  });

  after(async () => {
    await prisma.professionalRegistration.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.staffInAppNotice.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinicianVerification.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: platform.userId } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("PRSOP01 expand-contract backfill: physicians -> PHYSICIAN (dentistry specialty -> DENTIST); others untouched; idempotent", async () => {
    const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261120103000_prsop01_profession_prver_registrations_expand/migration.sql"), "utf8");
    const updates = sql.split(/;\s*\n/).map((x) => x.trim()).filter((x) => /^UPDATE /m.test(x.replace(/^--.*$/gm, "").trim()));
    assert.ok(updates.length >= 3);
    const gp = await mkUser("legacygp", UserRole.PHYSICIAN, null);
    const dent = await mkUser("legacydent", UserRole.PHYSICIAN, null);
    const reception = await mkUser("legacyfd", UserRole.RECEPTIONIST, null);
    const nurse = await mkUser("legacynurse", UserRole.NURSE, null);
    await prisma.clinicianVerification.create({ data: { userId: gp.id, tenantId, specialty: "GENERAL_MEDICINE", documentKeys: [] } });
    await prisma.clinicianVerification.create({ data: { userId: dent.id, tenantId, specialty: "DENTISTRY", documentKeys: [], status: VerificationStatus.VERIFIED, verifiedSpecialty: "DENTISTRY" } });
    for (let run = 0; run < 2; run++) {
      for (const stmt of updates) await prisma.$executeRawUnsafe(stmt.replace(/^--.*$/gm, ""));
    }
    const get = (id: string) => prisma.user.findUniqueOrThrow({ where: { id }, select: { profession: true } });
    assert.equal((await get(gp.id)).profession, Profession.PHYSICIAN);
    assert.equal((await get(dent.id)).profession, Profession.DENTIST);
    assert.equal((await get(reception.id)).profession, null);
    assert.equal((await get(nurse.id)).profession, Profession.NURSE);
    const v = await prisma.clinicianVerification.findUniqueOrThrow({ where: { userId: dent.id } });
    assert.equal(v.profession, Profession.DENTIST);
    assert.equal(v.verifiedProfession, Profession.DENTIST, "already-verified rows keep their status and gain the profession snapshot");
  });

  it("PRVER01/02: physiotherapist needs syndicate + MoH licence; ops checklist is the profession's; badge names the profession; PRVER03 schedule set", async () => {
    await mkUser("physio", UserRole.PHYSICIAN, Profession.PHYSIOTHERAPIST, "Phys Io");
    const me = users.physio!.jwt;
    const initial = await service.getMine(me);
    assert.equal(initial.profession, Profession.PHYSIOTHERAPIST);
    assert.deepEqual(initial.requiredDocuments, ["SYNDICATE_CARD", "MOH_LICENCE"]);
    assert.equal(initial.badge.verified, false);

    await assert.rejects(() => service.upsertMine(me, { syndicateNumber: "PT-1001", submit: true }), (e: unknown) => e instanceof BadRequestException && /Missing document/.test((e as Error).message));
    await service.attachDocument(me, "SYNDICATE_CARD", PDF);
    await service.attachDocument(me, "MOH_LICENCE", PDF);
    await assert.rejects(() => service.upsertMine(me, { syndicateNumber: "PT-1001", submit: true }), (e: unknown) => e instanceof BadRequestException && /Missing registration/.test((e as Error).message));
    await assert.rejects(
      () => service.upsertMine(me, { registrations: [{ registerCode: "EG_NURSING_SYNDICATE", registrationNumber: "N-1" }] }),
      (e: unknown) => e instanceof BadRequestException && /Unknown register/.test((e as Error).message),
    );
    const expiry = new Date(Date.now() + 200 * 24 * 3600 * 1000).toISOString();
    await assert.rejects(
      () => service.upsertMine(me, { syndicateNumber: "PT-1001", registrations: [{ registerCode: "EG_MOH_PHYSIOTHERAPY_LICENCE", registrationNumber: "MOH-77" }], submit: true }),
      (e: unknown) => e instanceof BadRequestException && /Expiry date required/.test((e as Error).message),
    );
    const submitted = await service.upsertMine(me, {
      syndicateNumber: "PT-1001",
      nationalId: "29001010100000",
      registrations: [{ registerCode: "EG_MOH_PHYSIOTHERAPY_LICENCE", registrationNumber: "MOH-77", expiresAt: expiry }],
      submit: true,
    });
    assert.equal(submitted.status, VerificationStatus.PENDING);
    assert.equal(submitted.registrations.length, 2, "syndicate + MoH registrations recorded");
    assert.ok(submitted.registrations.every((r) => r.status === VerificationStatus.PENDING));
    assert.ok(submitted.reviewChecklist.includes("moh_licence") && !submitted.reviewChecklist.includes("specialty_match"));

    const list = await service.listForPlatform(platform, { status: VerificationStatus.PENDING, profession: Profession.PHYSIOTHERAPIST });
    const item = list.items.find((i) => i.userId === users.physio!.id)!;
    assert.ok(item && item.clinicianCurrentProfession === Profession.PHYSIOTHERAPIST);
    const cfg = await service.getPlatformReviewConfig(platform);
    assert.ok(cfg.checklistByProfession.NURSE!.solo.includes("criminal_record_certificate"));
    assert.ok(cfg.checklistLabels.moh_licence!.ar.length > 0);

    // The legacy 4-key checklist is NOT enough for a physiotherapist.
    await assert.rejects(
      () => service.platformDecision(platform, submitted.id, { decision: "approve", checklist: ["syndicate_card", "specialty_match", "national_id_present", "documents_readable"] }),
      (e: unknown) => e instanceof BadRequestException && /moh_licence/.test((e as Error).message),
    );
    const approved = await service.platformDecision(platform, submitted.id, { decision: "approve", checklist: item.reviewChecklist });
    assert.equal(approved.status, VerificationStatus.VERIFIED);
    assert.equal(approved.badge.labelEn, "Verified physiotherapist");
    assert.equal(approved.verifiedProfession, Profession.PHYSIOTHERAPIST);
    assert.ok(approved.nextReverifyAt && new Date(approved.nextReverifyAt).toISOString().slice(0, 10) === expiry.slice(0, 10), "next re-verification = earliest licence expiry");
    assert.ok(approved.registrations.every((r) => r.status === VerificationStatus.VERIFIED));
  });

  it("KX-01 gate: a verified physiotherapist counts; an unlicensed assistant never does", () => {
    const row = (profession: string | null, role = "PHYSICIAN") => ({ status: VerificationStatus.VERIFIED, verifiedProfession: profession, user: { role, additionalRoles: [], profession } });
    assert.equal(tenantHasVerifiedPhysician([row("PHYSIOTHERAPIST")]), true);
    assert.equal(tenantHasVerifiedPhysician([row("ASSISTANT")]), false);
    assert.equal(tenantHasVerifiedPhysician([{ status: VerificationStatus.VERIFIED, verifiedProfession: "PHYSICIAN", user: { role: "PHYSICIAN", additionalRoles: [], profession: "NURSE" } }]), false);
  });

  it("PRSOP01 / PRVER03: changing profession forces re-verification and clears the old registrations", async () => {
    const before = await prisma.clinicianVerification.findUniqueOrThrow({ where: { userId: users.physio!.id } });
    assert.equal(before.status, VerificationStatus.VERIFIED);
    await assert.rejects(() => service.setProfession(users.physio!.jwt, users.physio!.id, Profession.NURSE), ForbiddenException);
    const res = await service.setProfession(admin, users.physio!.id, Profession.NURSE);
    assert.equal(res.reverification, true);
    const after = await prisma.clinicianVerification.findUniqueOrThrow({ where: { userId: users.physio!.id } });
    assert.notEqual(after.status, VerificationStatus.VERIFIED);
    assert.equal(after.reverifyReason, "PROFESSION_CHANGED");
    assert.equal(after.profession, Profession.NURSE);
    assert.equal(await prisma.professionalRegistration.count({ where: { userId: users.physio!.id } }), 0);
    const log = await prisma.auditLog.findFirst({ where: { tenantId, action: "clinician.profession.changed", resourceId: users.physio!.id } });
    assert.ok(log);
  });

  it("PRVER04: a solo nurse additionally needs ID selfie + criminal-record certificate; the reviewer checklist grows", async () => {
    await mkUser("nurse", UserRole.NURSE, Profession.NURSE, "Nur Se");
    const me = users.nurse!.jwt;
    await service.attachDocument(me, "SYNDICATE_CARD", PDF);
    await service.attachDocument(me, "MOH_LICENCE", PDF);
    const expiry = new Date(Date.now() + 400 * 24 * 3600 * 1000).toISOString();
    const body = { syndicateNumber: "NS-2002", nationalId: "29001010100001", registrations: [{ registerCode: "EG_MOH_LICENCE", registrationNumber: "MOH-5", expiresAt: expiry }], submit: true };
    const agency = await service.upsertMine(me, { ...body, solo: false });
    assert.equal(agency.status, VerificationStatus.PENDING);
    // back to draft (reject) then re-submit as solo
    await service.platformDecision(platform, agency.id, { decision: "reject", rejectReasonCode: "OTHER", rejectReason: "test" });
    await assert.rejects(() => service.upsertMine(me, { ...body, solo: true }), (e: unknown) => e instanceof BadRequestException && /ID_SELFIE/.test((e as Error).message));
    await service.attachDocument(me, "ID_SELFIE", PDF);
    await assert.rejects(() => service.upsertMine(me, { ...body, solo: true }), (e: unknown) => e instanceof BadRequestException && /CRIMINAL_RECORD_CERT/.test((e as Error).message));
    await service.attachDocument(me, "CRIMINAL_RECORD_CERT", PDF);
    const solo = await service.upsertMine(me, { ...body, solo: true });
    assert.equal(solo.status, VerificationStatus.PENDING);
    assert.ok(solo.reviewChecklist.includes("id_selfie_match") && solo.reviewChecklist.includes("criminal_record_certificate"));
    await assert.rejects(
      () => service.platformDecision(platform, solo.id, { decision: "approve", checklist: ["documents_readable", "syndicate_card", "moh_licence", "national_id_present"] }),
      (e: unknown) => e instanceof BadRequestException && /id_selfie_match/.test((e as Error).message),
    );
    const ok = await service.platformDecision(platform, solo.id, { decision: "approve", checklist: solo.reviewChecklist });
    assert.equal(ok.badge.labelEn, "Verified nurse");
  });

  it("PRVER03 / H11: a name change sends a VERIFIED clinician back to PENDING", async () => {
    const r = await applyReverification(prisma, users.nurse!.id, "NAME_CHANGED");
    assert.ok(r && !r.expired);
    const row = await prisma.clinicianVerification.findUniqueOrThrow({ where: { userId: users.nurse!.id } });
    assert.equal(row.status, VerificationStatus.PENDING);
    assert.equal(row.reverifyReason, "NAME_CHANGED");
    assert.equal(await applyReverification(prisma, users.nurse!.id, "NAME_CHANGED"), null, "idempotent: only VERIFIED records transition");
  });

  it("PRVER03: reminders at 60/30/7 days are sent once each; an overdue licence expires the verification", async () => {
    await mkUser("dentist", UserRole.PHYSICIAN, Profession.DENTIST, "Den Tist");
    const v = await prisma.clinicianVerification.create({
      data: { userId: users.dentist!.id, tenantId, profession: Profession.DENTIST, verifiedProfession: Profession.DENTIST, status: VerificationStatus.VERIFIED, verifiedAt: new Date(), documentKeys: [], nextReverifyAt: new Date(Date.now() + 25 * 24 * 3600 * 1000) },
    });
    await prisma.professionalRegistration.create({ data: { tenantId, userId: users.dentist!.id, verificationId: v.id, profession: Profession.DENTIST, registerCode: "EG_MOH_LICENCE", registrationNumber: "M-1", expiresAt: new Date(Date.now() + 25 * 24 * 3600 * 1000), status: VerificationStatus.VERIFIED } });
    const first = await reverify.runDaily();
    assert.ok(first.reminded >= 1);
    const stage = (await prisma.clinicianVerification.findUniqueOrThrow({ where: { id: v.id } })).expiryReminderStage;
    assert.equal(stage, 2, "25 days left passes the 60 and 30 day thresholds");
    const notices = await prisma.staffInAppNotice.count({ where: { tenantId, userId: users.dentist!.id, kind: "prver.reminder" } });
    assert.equal(notices, 1);
    await reverify.runDaily();
    assert.equal(await prisma.staffInAppNotice.count({ where: { tenantId, userId: users.dentist!.id, kind: "prver.reminder" } }), 1, "no repeat within the same stage");

    await prisma.clinicianVerification.update({ where: { id: v.id }, data: { nextReverifyAt: new Date(Date.now() - 1000) } });
    await prisma.professionalRegistration.updateMany({ where: { userId: users.dentist!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const second = await reverify.runDaily();
    assert.ok(second.expired >= 1);
    const row = await prisma.clinicianVerification.findUniqueOrThrow({ where: { id: v.id } });
    assert.equal(row.status, VerificationStatus.EXPIRED);
    assert.equal(row.reverifyReason, "LICENCE_EXPIRED");
  });

  it("PRSOP03: an assistant needs a named licensed supervisor, cannot be verified, and is never listed", async () => {
    await mkUser("assistant", UserRole.RECEPTIONIST, null, "Mass Age");
    await assert.rejects(() => service.setProfession(admin, users.assistant!.id, Profession.ASSISTANT), (e: unknown) => e instanceof BadRequestException && /supervis/.test((e as Error).message));
    await assert.rejects(() => service.setProfession(admin, users.assistant!.id, Profession.ASSISTANT, users.assistant!.id), BadRequestException);
    await assert.rejects(() => service.setProfession(admin, users.assistant!.id, Profession.ASSISTANT, users.admin!.id), (e: unknown) => e instanceof BadRequestException, "an unlicensed admin cannot supervise");
    const res = await service.setProfession(admin, users.assistant!.id, Profession.ASSISTANT, users.dentist!.id);
    assert.equal(res.supervisorUserId, users.dentist!.id);
    await assert.rejects(() => service.getMine(users.assistant!.jwt), ForbiddenException, "assistants have no verification flow");
  });
});
