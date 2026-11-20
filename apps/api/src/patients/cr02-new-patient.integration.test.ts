import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  AppointmentStatus,
  EncounterStatus,
  Gender,
  PrismaClient,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NewPatientService } from "./new-patient.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const newPatients = new NewPatientService(prisma as unknown as PrismaService);

describe("CR-02 NewPatientService.isNewToTenant", () => {
  const suffix = `cr02-${Date.now()}`;
  let tenantId: string;
  let clinicId: string;
  let clinicianId: string;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `CR02 ${suffix}`,
        deploymentCell: "frankfurt",
        marketId: market.id,
      },
    });
    tenantId = tenant.id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: "Clinic",
        nameAr: "عيادة",
        country: "EG",
        city: "Cairo",
        addressEn: "St",
        addressAr: "شارع",
        locationUrl: "https://maps.example/c",
        phone: "+201000000020",
        email: `c-${suffix}@test.com`,
        licenseNumber: "SELF-SERVE-PENDING",
        defaultCurrency: "EGP",
      },
    });
    clinicId = clinic.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `doc-${suffix}@test.com`,
        passwordHash: "x",
        displayName: "Doc",
        role: "PHYSICIAN",
      },
    });
    clinicianId = user.id;
  });

  after(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  async function seedPatient(phone: string, nationalId: string) {
    return prisma.patient.create({
      data: {
        tenantId,
        mrn: `MRN-${phone.slice(-4)}-${suffix}`,
        firstNameEn: "A",
        lastNameEn: "B",
        gender: Gender.UNKNOWN,
        phone,
        nationalId,
      },
    });
  }

  async function attendedVisit(patientId: string, checkedInAt: Date) {
    await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId,
        startsAt: checkedInAt,
        status: AppointmentStatus.COMPLETED,
        checkedInAt,
      },
    });
  }

  it("same phone: visit 23 months ago → not new; 25 months ago → new", async () => {
    const at = new Date("2026-06-01T12:00:00.000Z");
    const phone = "+201012345678";
    const nationalId = `NID-${suffix}-1`;

    const p23 = await seedPatient(phone, nationalId);
    const d23 = new Date(at);
    d23.setMonth(d23.getMonth() - 23);
    await attendedVisit(p23.id, d23);
    assert.equal(await newPatients.isNewToTenant(tenantId, phone, nationalId, at, 24), false);

    const p25 = await seedPatient("+201098765432", `NID-${suffix}-2`);
    const d25 = new Date(at);
    d25.setMonth(d25.getMonth() - 25);
    await attendedVisit(p25.id, d25);
    assert.equal(await newPatients.isNewToTenant(tenantId, "+201098765432", `NID-${suffix}-2`, at, 24), true);
  });

  it("nationalId match with different phone and prior visit → not new", async () => {
    const at = new Date("2026-06-01T12:00:00.000Z");
    const nationalId = `NID-SHARED-${suffix}`;
    const oldPhone = "+201011111111";
    const newPhone = "+201022222222";

    const original = await seedPatient(oldPhone, nationalId);
    const prior = new Date(at);
    prior.setMonth(prior.getMonth() - 6);
    await attendedVisit(original.id, prior);

    assert.equal(await newPatients.isNewToTenant(tenantId, newPhone, nationalId, at, 24), false);
  });

  it("signed encounter in window counts as not new", async () => {
    const at = new Date("2026-06-01T12:00:00.000Z");
    const phone = `+201033344455`;
    const nationalId = `NID-ENC-${suffix}`;
    const patient = await seedPatient(phone, nationalId);
    const signedAt = new Date(at);
    signedAt.setMonth(signedAt.getMonth() - 2);
    await prisma.encounter.create({
      data: {
        tenantId,
        clinicId,
        patientId: patient.id,
        clinicianId,
        status: EncounterStatus.FINALIZED,
        visitType: "follow_up",
        signedAt,
        finalizedAt: signedAt,
      },
    });
    assert.equal(await newPatients.isNewToTenant(tenantId, phone, nationalId, at, 24), false);
  });
});