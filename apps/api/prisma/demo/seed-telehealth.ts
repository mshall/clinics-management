/**
 * ADR-039 telehealth demo seed (DEV ONLY). Idempotent: switches "Offers telehealth" on for Dr Nadia (demo org `na`), makes sure the org
 * has a telehealth service (own duration/price), and creates ONE fresh demo video appointment starting in a few minutes with a session,
 * then prints BOTH join URLs (doctor call page + patient link).
 *
 *   npm run db:seed:telehealth -w api            (DEMO_SEED_ALLOWED=true is set by the script)
 *   TELEHEALTH_DEMO_START_IN_MIN=3 npm run db:seed:telehealth -w api
 *
 * Also called from seed-demo.ts with `quiet` so the demo tenants always carry the telehealth doctor + service (no appointment).
 */
import { AppointmentStatus, BookingSource, type PrismaClient } from "@prisma/client";
import { assertDemoSeedAllowed } from "../../src/common/demo-seed-guard";
import { createPrismaClient } from "../../src/prisma/create-prisma-client";
import { ensureTelehealthSession } from "../../src/telehealth/telehealth-sync";
import { signTelehealthToken } from "../../src/telehealth/telehealth-token";

export const TELEHEALTH_DEMO_DOCTOR = "nadia.na@demo.kiorex.test";
const DEMO_PATIENT_MRN = "DEMO-TH-001";

export async function seedTelehealthDemo(prisma: PrismaClient, opts: { appointment?: boolean; startInMin?: number } = {}) {
  const doctor = await prisma.user.findFirst({ where: { email: TELEHEALTH_DEMO_DOCTOR } });
  if (!doctor?.tenantId) throw new Error(`${TELEHEALTH_DEMO_DOCTOR} missing: run the demo seed first (npm run db:seed:demo -w api)`);
  const tenantId = doctor.tenantId;
  const clinic = await prisma.clinic.findFirstOrThrow({ where: { tenantId }, orderBy: { createdAt: "asc" } });
  await prisma.clinicianTelehealthSetting.upsert({
    where: { clinicianId: doctor.id },
    create: { tenantId, clinicianId: doctor.id, offersTelehealth: true },
    update: { offersTelehealth: true },
  });
  let type = await prisma.appointmentType.findFirst({ where: { tenantId, clinicId: clinic.id, serviceLocation: "VIDEO" } });
  if (!type) {
    type = await prisma.appointmentType.create({
      data: { tenantId, clinicId: clinic.id, nameEn: "Video consultation", nameAr: "استشارة فيديو", durationMinutes: 20, feeAmount: 250, serviceLocation: "VIDEO", marketplaceBookable: true, minNoticeMinutes: 60, maxDaysAhead: 30, colorHex: "#0d9488" },
    });
  }
  if (!opts.appointment) return { doctorEmail: doctor.email, typeId: type.id };

  const patient =
    (await prisma.patient.findFirst({ where: { tenantId, mrn: DEMO_PATIENT_MRN } })) ??
    (await prisma.patient.create({ data: { tenantId, mrn: DEMO_PATIENT_MRN, firstNameEn: "Salma", lastNameEn: "Telehealth", firstNameAr: "سلمى", lastNameAr: "عن بعد", gender: "F", phone: "+201000007001", email: "salma.th@demo.kiorex.test" } }));
  const startsAt = new Date(Date.now() + (opts.startInMin ?? 3) * 60_000);
  const apt = await prisma.appointment.create({
    data: {
      tenantId, clinicId: clinic.id, patientId: patient.id, clinicianId: doctor.id, appointmentTypeId: type.id,
      startsAt, endsAt: new Date(startsAt.getTime() + type.durationMinutes * 60_000), feeAmount: type.feeAmount, status: AppointmentStatus.CONFIRMED,
      serviceLocation: "VIDEO", bookingSource: BookingSource.FRONT_DESK, notes: "Demo telehealth: follow-up (headache)",
    },
  });
  const { id } = await prisma.$transaction((tx) => ensureTelehealthSession(tx, apt, doctor.id));
  const base = (process.env.APP_WEB_URL ?? "http://localhost:5174").replace(/\/+$/, "");
  const token = signTelehealthToken({ s: id, p: patient.id, v: 1 });
  return { doctorEmail: doctor.email, appointmentId: apt.id, sessionId: id, doctorUrl: `${base}/telehealth/${id}`, patientUrl: `${base}/v/${token}`, startsAt: startsAt.toISOString() };
}

if (require.main === module) {
  assertDemoSeedAllowed("Kiorly Clinic telehealth demo");
  const prisma = createPrismaClient();
  seedTelehealthDemo(prisma, { appointment: true, startInMin: Number(process.env.TELEHEALTH_DEMO_START_IN_MIN) || 3 })
    .then((r) => {
      console.log("Telehealth demo ready (DEV ONLY)");
      console.log(`  doctor login:   ${r.doctorEmail} (staff password in TEST_DATA.md)`);
      console.log(`  doctor call:    ${"doctorUrl" in r ? r.doctorUrl : ""}`);
      console.log(`  patient link:   ${"patientUrl" in r ? r.patientUrl : ""}`);
      console.log(`  starts at:      ${"startsAt" in r ? r.startsAt : ""} (room opens 10 minutes before)`);
    })
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
