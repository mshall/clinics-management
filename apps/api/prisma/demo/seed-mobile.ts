/**
 * Kiorly Work (staff mobile app) demo data, DEV ONLY. Idempotent (deterministic ids). Run after db:seed:demo:
 *   npm run db:seed:mobile -w api
 * Adds: a BASIC (Lite) org to show the upgrade path (owner.basic@ / doctor.basic@ / nurse.basic@demo.kiorex.test) with an open critical-vitals safety alert,
 * and, in the PRO demo org (na), a critical lab result waiting for the doctor + a critical vitals observation, so the alert inbox and approve flows have data.
 * The existing ENTERPRISE demo org (Kiorly Clinic Group, admin@kiorly.com) and PRO orgs (na, df) are reused. Password for every login: Demo@12345.
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { assertDemoSeedAllowed } from "../../src/common/demo-seed-guard";
import { ensurePlanEntitlements } from "../plans.seed";
import { createPrismaClient } from "../../src/prisma/create-prisma-client";

const prisma = createPrismaClient();
const PASSWORD = "Demo@12345"; // DEV ONLY

async function main() {
  assertDemoSeedAllowed("Kiorly Work mobile demo (BASIC org + PRO alerts)");
  await ensurePlanEntitlements(prisma);
  const market = await prisma.market.findFirst({ where: { code: "EG" } });
  if (!market) throw new Error("EG market missing: run `npm run db:seed -w api` first");
  const lite = await prisma.plan.findUniqueOrThrow({ where: { key: "LITE" } });
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const now = new Date();
  const tid = "demo_t_bs";

  // ---- BASIC org -----------------------------------------------------------------------------------------------
  await prisma.tenant.upsert({
    where: { id: tid }, update: {},
    create: { id: tid, name: "Corner Family Clinic (DEMO Basic)", nameAr: "عيادة الزاوية العائلية (تجريبي - أساسي)", marketId: market.id, baseCurrency: "EGP", defaultLocale: "ar", deploymentCell: market.hostCell, defaultVisitFee: 250, ownerConfirmedAt: now },
  });
  await prisma.clinic.upsert({
    where: { id: "demo_c_bs_main" }, update: {},
    create: { id: "demo_c_bs_main", tenantId: tid, nameEn: "Corner Family Clinic", nameAr: "عيادة الزاوية العائلية", country: "EG", city: "Cairo", addressEn: "3 Corner Street, Nasr City, Cairo", addressAr: "٣ شارع الزاوية، مدينة نصر، القاهرة", locationUrl: "https://maps.google.com/?q=30.0561,31.3301", latitude: 30.0561, longitude: 31.3301, phone: "+201000003401", email: "bs.main@demo.kiorex.test", licenseNumber: "DEMO-BS-MAIN", defaultCurrency: "EGP", defaultLanguage: "ar" },
  });
  if (!(await prisma.subscription.findUnique({ where: { tenantId: tid } }))) {
    await prisma.subscription.create({ data: { id: "demo_sub_bs", tenantId: tid, planId: lite.id, status: "ACTIVE", interval: "MONTHLY", clinicianSeats: 1, currentPeriodStart: new Date(now.getTime() - 12 * 864e5), currentPeriodEnd: new Date(now.getTime() + 18 * 864e5), activatedAt: new Date(now.getTime() - 60 * 864e5) } });
  }
  const users: [string, string, string, "GROUP_ADMIN" | "PHYSICIAN" | "NURSE", boolean, string | null][] = [
    ["demo_u_bs_owner", "owner.basic@demo.kiorex.test", "Ramy Hafez (Basic org owner)", "GROUP_ADMIN", true, null],
    ["demo_u_bs_doctor", "doctor.basic@demo.kiorex.test", "Dr Heba Lotfy (Basic)", "PHYSICIAN", false, "PHYSICIAN"],
    ["demo_u_bs_nurse", "nurse.basic@demo.kiorex.test", "Nurse Mervat Adel (Basic)", "NURSE", false, "NURSE"],
  ];
  for (const [id, email, displayName, role, owner, profession] of users) {
    await prisma.user.upsert({ where: { id }, update: { passwordHash: hash }, create: { id, tenantId: tid, email, passwordHash: hash, displayName, role, isTenantOwner: owner, ...(profession ? { profession: profession as never } : {}) } });
  }
  const bsPatient = await prisma.patient.upsert({
    where: { id: "demo_p_bs_1" }, update: {},
    create: { id: "demo_p_bs_1", tenantId: tid, mrn: "BS-0001", firstNameEn: "Nabil", lastNameEn: "Saad", firstNameAr: "نبيل", lastNameAr: "سعد", gender: "M", phone: "+201000003411", homeBranchId: "demo_c_bs_main" },
  });
  // open safety alert on the BASIC org: a critical vitals observation with no escalation entry (safety alerts reach every plan, ADR-025)
  await prisma.vitalsObservation.upsert({
    where: { id: "demo_vit_bs_crit" }, update: { escalatedAt: null, recordedAt: now },
    create: { id: "demo_vit_bs_crit", tenantId: tid, patientId: bsPatient.id, recordedById: "demo_u_bs_nurse", recordedAt: now, systolic: 195, diastolic: 125, pulse: 112, spo2: 91, flagsJson: { systolic: "CRITICAL_HIGH", diastolic: "CRITICAL_HIGH" }, critical: true },
  });

  // ---- PRO org (na): critical vitals + critical lab result waiting for review -----------------------------------
  const na = await prisma.tenant.findUnique({ where: { id: "demo_t_na" } });
  if (na) {
    const p = await prisma.patient.findFirst({ where: { tenantId: na.id, deletedAt: null }, orderBy: { mrn: "asc" } });
    const doc = await prisma.user.findFirst({ where: { tenantId: na.id, email: "nadia.na@demo.kiorex.test" } });
    const nurse = await prisma.user.findFirst({ where: { tenantId: na.id, email: "nurse.na@demo.kiorex.test" } });
    if (p && doc) {
      await prisma.clinicalOrder.upsert({
        where: { id: "demo_co_mobile_crit" }, update: { status: "RESULTS_READY", resultsReadyAt: now },
        create: { id: "demo_co_mobile_crit", tenantId: na.id, clinicId: "demo_c_na_maadi", patientId: p.id, kind: "LAB", status: "RESULTS_READY", orderedAt: new Date(now.getTime() - 6 * 36e5), resultsReadyAt: now, createdByUserId: doc.id, notes: "DEMO critical potassium for the Kiorly Work approve flow" },
      });
      await prisma.clinicalOrderItem.upsert({ where: { id: "demo_coi_mobile_k" }, update: {}, create: { id: "demo_coi_mobile_k", orderId: "demo_co_mobile_crit", code: "K", nameEn: "Potassium", nameAr: "البوتاسيوم", resultValue: "6.9", resultUnit: "mmol/L", resultFlag: "CRITICAL_HIGH", sortOrder: 0 } });
      await prisma.clinicalOrderItem.upsert({ where: { id: "demo_coi_mobile_na" }, update: {}, create: { id: "demo_coi_mobile_na", orderId: "demo_co_mobile_crit", code: "NA", nameEn: "Sodium", nameAr: "الصوديوم", resultValue: "139", resultUnit: "mmol/L", resultFlag: "N", sortOrder: 1 } });
      await prisma.clinicalOrder.upsert({
        where: { id: "demo_co_mobile_norm" }, update: { status: "RESULTS_READY", resultsReadyAt: now },
        create: { id: "demo_co_mobile_norm", tenantId: na.id, clinicId: "demo_c_na_maadi", patientId: p.id, kind: "LAB", status: "RESULTS_READY", orderedAt: new Date(now.getTime() - 20 * 36e5), resultsReadyAt: new Date(now.getTime() - 2 * 36e5), createdByUserId: doc.id },
      });
      await prisma.clinicalOrderItem.upsert({ where: { id: "demo_coi_mobile_hb" }, update: {}, create: { id: "demo_coi_mobile_hb", orderId: "demo_co_mobile_norm", code: "HB", nameEn: "Haemoglobin", nameAr: "الهيموجلوبين", resultValue: "13.2", resultUnit: "g/dL", resultFlag: "N", sortOrder: 0 } });
      if (nurse) {
        await prisma.vitalsObservation.upsert({
          where: { id: "demo_vit_na_crit" }, update: { escalatedAt: null, recordedAt: now },
          create: { id: "demo_vit_na_crit", tenantId: na.id, patientId: p.id, recordedById: nurse.id, recordedAt: now, systolic: 78, diastolic: 48, pulse: 128, spo2: 89, flagsJson: { systolic: "CRITICAL_LOW", spo2: "CRITICAL_LOW" }, critical: true },
        });
      }
    }
    // a draft consultation with a prescription waiting for the physician's signature (Prescriptions screen)
    if (p && doc) {
      await prisma.encounter.upsert({
        where: { id: "demo_enc_mobile_rx" }, update: { status: "DRAFT", finalizedAt: null, signedAt: null },
        create: { id: "demo_enc_mobile_rx", tenantId: na.id, clinicId: "demo_c_na_maadi", patientId: p.id, clinicianId: doc.id, status: "DRAFT", visitType: "Consultation", chiefComplaint: "Seasonal allergy (DEMO for Kiorly Work)", subjective: "Itchy eyes and sneezing for 3 days.", plan: "Antihistamine, review in 1 week." },
      });
      await prisma.encounterMedication.upsert({ where: { id: "demo_em_mobile_1" }, update: {}, create: { id: "demo_em_mobile_1", tenantId: na.id, encounterId: "demo_enc_mobile_rx", drugName: "Cetirizine 10 mg", dosage: "10 mg", route: "PO", frequency: "Once daily", duration: "7 days" } });
    }
    // fresh home-visit safety alerts (SOS in the PRO org, a missed check-in in the nurse org)
    for (const [tenantId, alertId, kind] of [[na.id, "demo_hsa_mobile_sos", "SOS"], ["demo_t_nsolo", "demo_hsa_mobile_noanswer", "NO_ANSWER"]] as const) {
      const v = await prisma.homeVisit.findFirst({ where: { tenantId, clinicianId: { not: null } }, orderBy: { plannedStartsAt: "desc" } });
      if (v) await prisma.homeSafetyAlert.upsert({ where: { id: alertId }, update: { raisedAt: now, dueAt: now, acknowledgedAt: null, status: "DELIVERED", escalatedAt: null, resolvedAt: null }, create: { id: alertId, tenantId, visitId: v.id, kind, raisedAt: now, dueAt: now, status: "DELIVERED", deliveredAt: now, deliveryChannel: "SMS", withinSla: true } });
    }
    // welcome pushes (mock inbox) for every demo staff login of the PRO org
    const staff = await prisma.user.findMany({ where: { tenantId: na.id, deletedAt: null, role: { in: ["GROUP_ADMIN", "PHYSICIAN", "NURSE", "BRANCH_MANAGER", "FINANCE_OFFICER"] } }, select: { id: true } });
    for (const s of staff) {
      await prisma.mobilePush.upsert({ where: { id: `demo_mp_${s.id}` }, update: {}, create: { id: `demo_mp_${s.id}`, tenantId: na.id, userId: s.id, kind: "GENERAL", templateId: "TEST", title: "Welcome to Kiorly Work", titleAr: "مرحبًا بك في Kiorly Work", body: "Your clinic is on a plan that includes the staff app.", bodyAr: "باقة عيادتك تشمل تطبيق الموظفين.", provider: "mock", deliveredAt: now } });
    }
  }
  console.log("mobile demo seed done: BASIC org demo_t_bs; PRO org na enriched");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
