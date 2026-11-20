/**
 * Kiorly Clinic DEMO / QA dataset (synthetic, DEV ONLY — see /TEST_DATA.md).
 *
 *   npm run db:seed:demo -w api              idempotent (deterministic ids + skipDuplicates)
 *   npm run db:seed:demo -w api -- --reset   first deletes ONLY the three demo tenants (+ their rows), then re-creates
 *                                            with dates re-anchored to "today"
 *
 * Never touches non-demo tenants. Refuses unless DEMO_SEED_ALLOWED=true and the environment is non-production (src/common/demo-seed-guard.ts). Compiled: `npm run build:seed -w api && node dist-seed/prisma/demo/seed-demo.js`.
 * No tax-authority anything: VAT is a plain configurable % line on invoices.
 * Names, phones (+20100000xxxx), e-mails (@demo.kiorex.test) are fictional.
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertDemoSeedAllowed } from "../../src/common/demo-seed-guard";
import { FIRST_F, FIRST_M, LAST, PERSONAS, TENANTS, type DocSpec } from "./demo-data";
import { NURSE_DEMO_TENANT_NAMES } from "../nurse-demo.seed";
import { seedRev23 } from "./seed-rev23";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "Demo@12345"; // DEV ONLY
const RESET = process.argv.includes("--reset");
const VAT = 14; // plain configurable VAT % shown on invoices (market-pack config)
const DAY = 86_400_000;
const today0 = new Date(); today0.setUTCHours(0, 0, 0, 0);
const at = (offsetDays: number, hourUtc: number, min = 0) => new Date(today0.getTime() + offsetDays * DAY + hourUtc * 3_600_000 + min * 60_000);

// deterministic PRNG so every run builds the same dataset
let seed = 20261120;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const chunk = <T,>(a: T[], n = 800) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
async function many(model: string, rows: any[]) {
  for (const c of chunk(rows)) await (prisma as any)[model].createMany({ data: c, skipDuplicates: true });
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Delete everything belonging to the demo tenants (generic: every table with a tenantId column, FK-safe retry loop). */
async function resetDemo(tenantIds: string[]) {
  if (!tenantIds.length) return;
  const tables: { table_name: string }[] = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name=c.table_name AND t.table_schema=c.table_schema
     WHERE c.table_schema='public' AND c.column_name='tenantId' AND t.table_type='BASE TABLE' AND c.table_name <> 'Tenant'`);
  const ids = tenantIds.map((i) => `'${i}'`).join(",");
  let pending = tables.map((t) => t.table_name);
  for (let pass = 0; pass < 12 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) {
      try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${ids})`); } catch { next.push(t); }
    }
    pending = next;
  }
  try { await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id IN (${ids})`); } catch (e: any) { console.warn("tenant delete:", e.message?.slice(0, 200), "remaining:", pending.join(",")); }
  // rows keyed by wallet/invoice rather than tenant
  console.log(`demo reset: removed demo tenants ${tenantIds.length} (unresolved tables: ${pending.join(",") || "none"})`);
}

async function main() {
  assertDemoSeedAllowed("Kiorly Clinic (demo tenants na/df/ss + Nurse edition)");
  const market = await prisma.market.findFirst({ where: { code: "EG" } });
  if (!market) throw new Error("EG market missing: run `npm run db:seed -w api` first");
  const plans = Object.fromEntries((await prisma.plan.findMany()).map((p) => [p.key, p]));
  const planPrices = await prisma.planPrice.findMany();
  const mpClient = await prisma.platformIntegrationClient.findUnique({ where: { clientKey: "kx_dev_client" } });
  if (!mpClient) throw new Error("kx_dev_client missing: run `npm run db:seed -w api` first");
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

  const demoNames = [...TENANTS.map((t) => t.name), ...NURSE_DEMO_TENANT_NAMES]; // + the Rev 2.3 Nurse-edition demo tenants (seed-rev23.ts)
  if (RESET) {
    const old = await prisma.tenant.findMany({ where: { name: { in: demoNames } }, select: { id: true } });
    await resetDemo(old.map((o) => o.id));
  }

  // one commission rate row (validity already ended => never the "current" rate the e2e relies on). Label: NOT a real rate.
  const rateId = "demo_kx_rate_eg";
  await prisma.kiorexCommissionRate.upsert({
    where: { id: rateId },
    create: { id: rateId, marketId: market.id, feeType: "FLAT", amount: 60, benchmarkSource: "DEV-DEMO-NOT-A-REAL-RATE", validFrom: at(-200, 0), validTo: at(-1, 0) },
    update: {},
  });

  const marketplace = JSON.parse(readFileSync(join(__dirname, "demo-marketplace-bookings.json"), "utf8")).bookings as any[];
  const summary: string[] = [];

  for (const T of TENANTS) {
    const tk = T.key;
    let tenant = await prisma.tenant.findFirst({ where: { name: T.name } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          id: `demo_t_${tk}`, name: T.name, nameAr: T.nameAr, marketId: market.id, baseCurrency: "EGP", defaultLocale: "ar", deploymentCell: market.hostCell,
          defaultVisitFee: T.docs[0].fee, defaultInvoiceVatPercent: VAT, whatsAppRemindersEnabled: true, ownerConfirmedAt: at(-80, 9),
        },
      });
    }
    const tid = tenant.id;
    const U = (n: string) => `demo_u_${tk}_${n}`;
    const email = (n: string) => `${n}.${tk}@demo.kiorex.test`;

    // ---- clinics (branches) -------------------------------------------------------------------------------------
    const clinicRows = T.clinics.map((c) => ({
      id: `demo_c_${tk}_${c.key}`, tenantId: tid, nameEn: c.nameEn, nameAr: c.nameAr, country: "EG", city: c.city, addressEn: c.addrEn, addressAr: c.addrAr,
      locationUrl: `https://maps.google.com/?q=${c.lat},${c.lng}`, latitude: c.lat, longitude: c.lng, phone: c.phone, email: `${tk}.${c.key}@demo.kiorex.test`,
      licenseNumber: `DEMO-${tk.toUpperCase()}-${c.key.toUpperCase()}`, defaultCurrency: "EGP", defaultLanguage: "ar", clinicalSpecialty: "POLYCLINIC",
      invoiceVatPercent: VAT, taxRegistrationNumber: "DEMO-000-000", timezone: "Africa/Cairo", bookingSlug: `demo-${tk}-${c.key}`,
      frontDeskRoomLabels: ["Room 1", "Room 2", "Room 3"], depositPolicy: { depositMinor: 0, note: "DEV demo" },
    }));
    await many("clinic", clinicRows);

    // ---- appointment types (marketplace-bookable) ------------------------------------------------------------------
    const typeRows: any[] = [];
    for (const c of T.clinics) for (const [i, t] of [["consult", "Consultation", "كشف", 30, 1], ["follow", "Follow-up", "متابعة", 15, 0.6], ["proc", "Procedure / minor", "إجراء", 45, 1.6]] as const) {
      const base = T.docs.find((d) => d.clinic === c.key)?.fee ?? 400;
      typeRows.push({ id: `demo_ty_${tk}_${c.key}_${i}`, tenantId: tid, clinicId: `demo_c_${tk}_${c.key}`, nameEn: t, nameAr: (typeRows.length, ["كشف", "متابعة", "إجراء"][["consult", "follow", "proc"].indexOf(i)]), durationMinutes: i === "proc" ? 45 : i === "follow" ? 15 : 30, feeAmount: Math.round(base * (i === "proc" ? 1.6 : i === "follow" ? 0.6 : 1)), marketplaceBookable: i !== "proc", isActive: true, colorHex: i === "consult" ? "#3b82f6" : i === "follow" ? "#10b981" : "#f59e0b" });
    }
    await many("appointmentType", typeRows);

    // ---- users: admin + staff + doctors ----------------------------------------------------------------------------
    const userRows: any[] = []; const empRows: any[] = [];
    let empNo = 1;
    const addUser = (id: string, mail: string, name: string, role: string, extra: any = {}) => userRows.push({ id, tenantId: tid, email: mail, passwordHash, displayName: name, role, ...extra });
    const addEmp = (userId: string, clinicKey: string, en: string, role: string, salary: number, spec?: string) => {
      const [f, ...l] = en.replace(/^Dr /, "").split(" ");
      empRows.push({ id: `demo_e_${tk}_${empNo}`, tenantId: tid, clinicId: `demo_c_${tk}_${clinicKey}`, employeeNumber: `DEMO-${tk.toUpperCase()}-${String(empNo).padStart(3, "0")}`, firstNameEn: f, lastNameEn: l.join(" ") || "Demo", phone: `+20100000${String(7000 + empNo + (tk === "na" ? 0 : tk === "df" ? 100 : 200))}`, jobTitle: role, employmentType: "FULL_TIME", hireDate: at(-400 - empNo * 11, 0), salaryBase: salary, userId, clinicalSpecialty: spec, email: `emp${empNo}.${tk}@demo.kiorex.test` });
      empNo++;
    };
    const c0 = T.clinics[0].key; const c1 = (T.clinics[1] ?? T.clinics[0]).key;
    addUser(U("owner"), email("owner"), T.ownerEn, "GROUP_ADMIN", { isTenantOwner: true }); addEmp(U("owner"), c0, T.ownerEn, "Group administrator", 40000);
    addUser(U("manager"), email("manager"), `Branch Manager ${T.short}`, "BRANCH_MANAGER"); addEmp(U("manager"), c0, `Branch Manager ${T.short}`, "Branch manager", 30000);
    addUser(U("frontdesk1"), email("frontdesk1"), `Front Desk ${T.short} 1`, "RECEPTIONIST"); addEmp(U("frontdesk1"), c0, `Front Desk ${T.short} 1`, "Receptionist", 9000);
    addUser(U("frontdesk2"), email("frontdesk2"), `Front Desk ${T.short} 2`, "RECEPTIONIST"); addEmp(U("frontdesk2"), c1, `Front Desk ${T.short} 2`, "Receptionist", 9000);
    addUser(U("nurse"), email("nurse"), `Nurse ${T.short}`, "NURSE"); addEmp(U("nurse"), c0, `Nurse ${T.short}`, "Nurse", 12000);
    addUser(U("accountant"), email("accountant"), `Accountant ${T.short}`, "FINANCE_OFFICER"); addEmp(U("accountant"), c0, `Accountant ${T.short}`, "Accountant", 15000);
    addUser(U("callcenter"), email("callcenter"), `Call Center ${T.short}`, "CALL_CENTER");
    for (const d of T.docs) { addUser(U(d.key), email(d.key), d.nameEn, "PHYSICIAN"); addEmp(U(d.key), d.clinic, d.nameEn, d.titleEn, 45000, d.spec); }
    await many("user", userRows); await many("employee", empRows);

    // ---- doctors: verification, availability, Kiorex listing -------------------------------------------------------
    const verRows: any[] = []; const availRows: any[] = []; const listRows: any[] = [];
    for (const d of T.docs) {
      const clinicId = `demo_c_${tk}_${d.clinic}`;
      verRows.push({ id: `demo_v_${tk}_${d.key}`, userId: U(d.key), tenantId: tid, status: d.listing === "PENDING_VERIFICATION" ? "PENDING" : "VERIFIED", specialty: d.spec, verifiedSpecialty: d.listing === "PENDING_VERIFICATION" ? undefined : d.spec, syndicateNumber: `DEMO-SYN-${tk}-${d.key}`.toUpperCase(), titleEn: d.titleEn, titleAr: d.titleAr, documentKeys: [], reviewedAt: d.listing === "PENDING_VERIFICATION" ? undefined : at(-60, 10) });
      const days = d.offDays ?? [5];
      availRows.push({ id: `demo_av_${tk}_${d.key}`, tenantId: tid, clinicId, clinicianId: U(d.key), blockedJson: [], weekJson: { version: 1, timezone: "Africa/Cairo", days: [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, slots: days.includes(w) ? [] : [{ start: "09:00", end: "13:00" }, { start: "16:00", end: "20:00" }] })) } });
      const types = typeRows.filter((t) => t.clinicId === clinicId && t.marketplaceBookable);
      listRows.push({ id: `demo_l_${tk}_${d.key}`, tenantId: tid, clinicId, clinicianId: U(d.key), status: d.listing, pausedReason: d.listing === "PAUSED" ? "owner" : null, listedAt: d.listing === "LIVE" || d.listing === "PAUSED" ? at(-50, 9) : null, bookingSlug: `demo-${tk}-${d.key}`, profileJson: { displayNameEn: d.nameEn, displayNameAr: d.nameAr, titleEn: d.titleEn, titleAr: d.titleAr, specialty: d.spec, gender: d.gender ?? "UNSPECIFIED", languages: ["ar", "en"], bioEn: d.bioEn, bioAr: d.bioAr, education: [{ degreeEn: "MBBCh, Ain Shams University (demo)", degreeAr: "بكالوريوس الطب والجراحة، جامعة عين شمس (تجريبي)" }], yearsExperience: d.years, feesByAppointmentTypeId: Object.fromEntries(types.map((t) => [t.id, Number(t.feeAmount)])), amenities: ["wifi", "ac"], parking: true, wheelchairAccess: true } });
    }
    await many("clinicianVerification", verRows); await many("clinicianAvailabilityTemplate", availRows); await many("marketplaceListing", listRows);

    // ---- patients -------------------------------------------------------------------------------------------------
    const patRows: any[] = []; const patInfo: { id: string; clinic: string; name: string }[] = [];
    const nPat = T.patients;
    for (let i = 1; i <= nPat; i++) {
      const persona = i <= 12 && T.key === "na" ? 1000 + i : null; // the Passport demo personas are patients of the first org
      const P = persona ? PERSONAS[i - 1] : null;
      const male = P ? P.male : i % 2 === 1; const fi = P ? P.first : pick(male ? FIRST_M : FIRST_F); const li = P ? P.last : pick(LAST);
      const age = persona ? [34, 38, 41, 29, 52, 31, 27, 44, 36, 33, 25, 39][i - 1] : 3 + Math.floor(rnd() * 70);
      const clinic = T.clinics[i % T.clinics.length].key;
      const id = `demo_p_${tk}_${i}`;
      patInfo.push({ id, clinic, name: `${fi[0]} ${li[0]}` });
      patRows.push({ id, tenantId: tid, mrn: `${tk.toUpperCase()}-${String(100000 + i)}`, firstNameEn: fi[0], lastNameEn: li[0], firstNameAr: fi[1], lastNameAr: li[1], gender: male ? "M" : "F", dob: new Date(Date.UTC(2026 - age, i % 12, 1 + (i % 27))), phone: persona ? `+20100000${persona}` : `+20100005${String(i + (tk === "df" ? 300 : tk === "ss" ? 600 : 0)).padStart(3, "0")}`, email: `patient${i}.${tk}@demo.kiorex.test`, homeBranchId: `demo_c_${tk}_${clinic}`, isVip: i % 17 === 0, noShowCount: i % 11 === 0 ? 2 : 0, acquisitionChannel: pick(["SOCIAL_FACEBOOK", "SOCIAL_INSTAGRAM", "WEBSITE_GOOGLE", "DOCTOR_REFERRAL", "KIOREX"] as const) , isSample: true, nationalId: null });
    }
    await many("patient", patRows);
    // families, allergies, problems
    const famRows: any[] = []; const allergyRows: any[] = []; const probRows: any[] = [];
    for (let i = 1; i + 1 <= Math.min(nPat, 30); i += 6) {
      famRows.push({ id: `demo_f_${tk}_${i}_a`, tenantId: tid, fromPatientId: `demo_p_${tk}_${i}`, toPatientId: `demo_p_${tk}_${i + 1}`, relation: "SPOUSE" });
      famRows.push({ id: `demo_f_${tk}_${i}_b`, tenantId: tid, fromPatientId: `demo_p_${tk}_${i}`, toPatientId: `demo_p_${tk}_${i + 2}`, relation: "PARENT" });
    }
    for (let i = 1; i <= nPat; i += 4) allergyRows.push({ id: `demo_al_${tk}_${i}`, tenantId: tid, patientId: `demo_p_${tk}_${i}`, code: pick(["PENICILLIN", "ASPIRIN", "SULFA", "NSAIDS", "PEANUTS", "LATEX"] as const) });
    const PROBS = [["I10", "Essential hypertension", "ضغط الدم المرتفع"], ["E11", "Type 2 diabetes mellitus", "السكري من النوع الثاني"], ["J45", "Asthma", "الربو"], ["E03", "Hypothyroidism", "قصور الغدة الدرقية"]];
    for (let i = 3; i <= nPat; i += 5) { const p = pick(PROBS); probRows.push({ id: `demo_pr_${tk}_${i}`, tenantId: tid, patientId: `demo_p_${tk}_${i}`, icd10Code: p[0], labelEn: p[1], labelAr: p[2], onsetDate: at(-300, 0) }); }
    await many("patientFamilyLink", famRows); await many("patientAllergy", allergyRows); await many("patientActiveProblem", probRows);

    // ---- appointments + encounters + billing ------------------------------------------------------------------------
    const apptRows: any[] = []; const encRows: any[] = []; const dxRows: any[] = []; const medRows: any[] = []; const invRows: any[] = []; const lineRows: any[] = [];
    const payRows: any[] = []; const revRows: any[] = []; const orderRows: any[] = []; const orderItemRows: any[] = []; const tokRows: any[] = []; const chargeRows: any[] = [];
    let invNo = 1; let aptNo = 0; const stat: Record<string, number> = {};
    const typeFor = (clinicKey: string, kind: string) => `demo_ty_${tk}_${clinicKey}_${kind}`;
    const completedFor: { aptId: string; encId: string }[] = [];

    const mkAppt = (o: { id: string; d: DocSpec; patient: string; start: Date; status: string; source: string; ext?: string; kind?: string; fee?: number }) => {
      const clinicKey = o.d.clinic; const dur = o.kind === "follow" ? 15 : 30; const fee = o.fee ?? Math.round(o.d.fee * (o.kind === "follow" ? 0.6 : 1));
      const done = o.status === "COMPLETED"; const ci = o.status === "CHECKED_IN";
      const row: any = { id: o.id, tenantId: tid, clinicId: `demo_c_${tk}_${clinicKey}`, patientId: o.patient, clinicianId: U(o.d.key), appointmentTypeId: typeFor(clinicKey, o.kind ?? "consult"), startsAt: o.start, endsAt: new Date(o.start.getTime() + dur * 60000), feeAmount: fee, status: o.status, bookingSource: o.source, scheduledCollectionMode: "CASH_ON_VISIT", isNewPatientAtBooking: chance(0.3), notes: chance(0.15) ? "Demo note: patient asked for a reminder" : null, roomLabel: ci ? `Room ${1 + (aptNo % 3)}` : null };
      if (done || ci) { row.checkedInAt = new Date(o.start.getTime() - 10 * 60000); row.queueTicketNumber = 1 + (aptNo % 40); row.checkInPaymentAmount = fee; row.checkInCollectionMode = "CASH_ON_VISIT"; }
      if (ci) { row.queueStage = pick(["WAITING", "CALLED", "IN_EXAM"] as const); if (row.queueStage !== "WAITING") row.calledAt = new Date(); }
      if (o.status === "NO_SHOW") row.noShowAt = new Date(o.start.getTime() + 30 * 60000);
      if (o.status === "CANCELLED") { row.cancelledAt = new Date(o.start.getTime() - 2 * DAY); row.cancelledBy = pick(["PATIENT", "CLINIC"] as const); row.cancellationReason = pick(["Patient request", "Doctor unavailable", "Schedule conflict"] as const); }
      if (o.status === "CONFIRMED" || o.status === "SCHEDULED") row.whatsappConfirmedAt = chance(0.5) ? new Date() : null;
      if (o.source === "KIOREX_MARKETPLACE") { row.platformIntegrationClientId = mpClient.id; row.externalReference = o.ext; row.attributionJson = { source: "KIOREX_MARKETPLACE", demo: true }; }
      stat[o.status] = (stat[o.status] ?? 0) + 1; aptNo++;
      apptRows.push(row);
      return row;
    };

    const doEncounter = (aptRow: any, d: DocSpec) => {
      const sp = SPEC_CLIN[d.spec] ?? SPEC_CLIN.GENERAL_MEDICINE;
      const k = Math.floor(rnd() * sp.cases.length); const cs = sp.cases[k];
      const encId = `demo_en_${aptRow.id.slice(9)}`;
      const age = true;
      encRows.push({ id: encId, tenantId: tid, clinicId: aptRow.clinicId, patientId: aptRow.patientId, clinicianId: aptRow.clinicianId, appointmentId: aptRow.id, visitType: aptRow.appointmentTypeId?.endsWith("follow") ? "Follow-up" : "Consultation", status: "FINALIZED", chiefComplaint: cs.cc, subjective: cs.s, objective: cs.o, assessment: cs.a, plan: cs.p, heartRate: 62 + Math.floor(rnd() * 30), spo2: 96 + Math.floor(rnd() * 4), bpSystolic: 105 + Math.floor(rnd() * 35), bpDiastolic: 65 + Math.floor(rnd() * 22), temperature: 36.4 + Math.round(rnd() * 15) / 10, weightKg: 45 + Math.floor(rnd() * 45), heightCm: 150 + Math.floor(rnd() * 35), visitFeeAmount: aptRow.feeAmount, visitFeeCurrency: "EGP", finalizedAt: new Date(aptRow.startsAt.getTime() + 30 * 60000), signedAt: new Date(aptRow.startsAt.getTime() + 32 * 60000), signedByUserId: aptRow.clinicianId, noteLockedAt: new Date(aptRow.startsAt.getTime() + 3 * DAY), followUpStatus: chance(0.25) ? "PENDING_BOOKING" : "NONE", followUpDueAt: chance(0.25) ? new Date(aptRow.startsAt.getTime() + 14 * DAY) : null, followUpWeeks: 2 });
      dxRows.push({ id: `demo_dx_${encId}`, tenantId: tid, encounterId: encId, icd10Code: cs.icd, descriptionEn: cs.dx, descriptionAr: cs.dxAr, isPrimary: true });
      for (const [j, m] of cs.meds.entries()) medRows.push({ id: `demo_md_${encId}_${j}`, tenantId: tid, encounterId: encId, drugName: m[0], dosage: m[1], route: "PO", frequency: m[2], duration: m[3], instructions: "As directed" });
      if (cs.meds.length && chance(0.4)) tokRows.push({ id: `demo_rxt_${encId}`, tenantId: tid, encounterId: encId, tokenHash: sha(`demo-rx-${encId}`), expiresAt: at(30, 0), createdByUserId: aptRow.clinicianId });
      if (cs.lab && chance(0.5)) {
        const oid = `demo_o_${encId}`; const age2 = (new Date().getTime() - aptRow.startsAt.getTime()) / DAY;
        const status = age2 > 6 ? "RESULTS_READY" : age2 > 2 ? "IN_PROGRESS" : "ORDERED";
        orderRows.push({ id: oid, tenantId: tid, clinicId: aptRow.clinicId, patientId: aptRow.patientId, encounterId: encId, kind: cs.lab[0] as string, status, orderedAt: aptRow.startsAt, resultsReadyAt: status === "RESULTS_READY" ? new Date(aptRow.startsAt.getTime() + 2 * DAY) : null, createdByUserId: aptRow.clinicianId, notes: "Demo order" });
        for (const [j, it] of (cs.lab[1] as string[][]).entries()) orderItemRows.push({ id: `demo_oi_${oid}_${j}`, orderId: oid, nameEn: it[0], nameAr: it[1], code: it[2], sortOrder: j, ...(status === "RESULTS_READY" ? { resultValue: it[3], resultUnit: it[4], resultFlag: j === 0 && chance(0.3) ? "H" : "N" } : {}) });
      }
      // invoice + payment + revenue (VAT = plain configured % line)
      const fee = Number(aptRow.feeAmount); const extra = chance(0.35) ? Math.round(fee * 0.4) : 0;
      const invId = `demo_inv_${tk}_${invNo}`; const num = `DEMO-${tk.toUpperCase()}-${String(invNo).padStart(5, "0")}`; invNo++;
      const clinic = T.clinics.find((c) => aptRow.clinicId.endsWith(c.key))!; const prow = patRows.find((p) => p.id === aptRow.patientId); const pat = { id: aptRow.patientId, name: `${prow?.firstNameEn ?? "Patient"} ${prow?.lastNameEn ?? ""}`.trim() };
      invRows.push({ id: invId, tenantId: tid, clinicId: aptRow.clinicId, patientId: aptRow.patientId, encounterId: encId, invoiceNumber: num, currency: "EGP", backgroundColor: "white", sectionsSnapshot: ["clinicHeader", "patientDetails", "invoiceMeta", "lineItems", "totals", "footer"], patientName: pat.name, patientMrn: prow?.mrn, clinicNameEn: clinic.nameEn, clinicNameAr: clinic.nameAr, clinicAddressEn: clinic.addrEn, clinicAddressAr: clinic.addrAr, clinicPhone: clinic.phone, clinicEmail: `${tk}.${clinic.key}@demo.kiorex.test`, clinicLicenseNumber: `DEMO-${tk.toUpperCase()}-${clinic.key.toUpperCase()}`, vatPercentSnapshot: VAT, issueDate: aptRow.startsAt, createdByUserId: U("frontdesk1"), createdAt: aptRow.startsAt });
      lineRows.push({ id: `${invId}_l1`, invoiceId: invId, purpose: aptRow.appointmentTypeId?.endsWith("follow") ? "Follow-up visit" : "Consultation", quantity: 1, unitPrice: fee, amountPaid: fee, taxPercent: VAT, sortOrder: 0 });
      if (extra) lineRows.push({ id: `${invId}_l2`, invoiceId: invId, purpose: cs.proc ?? "Procedure / supplies", quantity: 1, unitPrice: extra, amountPaid: extra, taxPercent: VAT, sortOrder: 1 });
      const total = fee + extra; const paid = chance(0.9);
      if (paid) payRows.push({ id: `demo_pay_${tk}_${invNo}`, tenantId: tid, clinicId: aptRow.clinicId, patientId: aptRow.patientId, invoiceId: invId, totalAmount: total, currency: "EGP", cashierUserId: U("frontdesk1"), createdAt: aptRow.startsAt });
      const net = Math.round((total / (1 + VAT / 100)) * 100) / 100;
      revRows.push({ id: `demo_rv_${tk}_${invNo}`, tenantId: tid, clinicId: aptRow.clinicId, category: "Consultation", grossAmount: total, taxAmount: Math.round((total - net) * 100) / 100, netAmount: net, currency: "EGP", postedAt: aptRow.startsAt, appointmentId: aptRow.id, encounterId: encId, status: paid ? "POSTED" : "RECEIVABLE", description: `Visit ${num}`, collectionMode: "CASH_ON_VISIT" });
      completedFor.push({ aptId: aptRow.id, encId });
    };

    // marketplace appointments from the shared spec (the Kiorex seed mirrors them as BookingIntents)
    const mk = marketplace.filter((b) => T.docs.some((d) => d.nameEn === b.doctorNameEn));
    const mkOcc = new Set<string>();
    for (const b of mk) {
      const d = T.docs.find((x) => x.nameEn === b.doctorNameEn)!;
      const pn = (b.patientPhone.slice(-4) | 0) - 1000; const pid = tk === "na" ? `demo_p_na_${pn}` : `demo_p_${tk}_mk${pn}`;
      if (!patRows.find((p) => p.id === pid)) {
        // personas live in the first tenant; other tenants get a same-phone patient row so the booking resolves
        patRows.push({ id: pid, tenantId: tid, mrn: `${tk.toUpperCase()}-M${b.patientPhone.slice(-4)}`, firstNameEn: "Kiorex", lastNameEn: `Patient ${b.patientPhone.slice(-4)}`, gender: "F", phone: b.patientPhone, dob: new Date(Date.UTC(1990, 1, 1)), homeBranchId: `demo_c_${tk}_${d.clinic}`, isSample: true });
        await many("patient", [patRows[patRows.length - 1]]);
      }
      const start = at(b.dayOffset, b.hourUtc);
      const row = mkAppt({ id: `demo_mk_${b.key}`, d, patient: pid, start, status: b.kiorlyStatus, source: "KIOREX_MARKETPLACE", ext: `demo_bk_${b.key}`, fee: undefined });
      mkOcc.add(`${d.key}|${start.getTime()}`);
      if (b.kiorlyStatus === "COMPLETED") {
        doEncounter(row, d);
        const ch = ({ 0: "CONFIRMED", 1: "BILLED", 2: "PENDING", 3: "DISPUTED", 4: "WAIVED" } as any)[chargeRows.length % 5];
        chargeRows.push({ id: `demo_cc_${tk}_${b.key}`, tenantId: tid, clinicId: row.clinicId, appointmentId: row.id, patientId: row.patientId, clinicianId: row.clinicianId, rateId, amount: 60, currency: "EGP", status: ch, attendedAt: start, disputeDeadline: new Date(start.getTime() + 14 * DAY), confirmedAt: ch !== "PENDING" ? new Date(start.getTime() + DAY) : null });
      }
    }

    // organic schedule: -45 .. +14 days
    for (const d of T.docs) {
      const offs = d.offDays ?? [5];
      for (let off = -45; off <= 14; off++) {
        const dt = at(off, 0); if (offs.includes(dt.getUTCDay())) continue;
        const nSlots = off < 0 ? 2 + Math.floor(rnd() * 3) : off === 0 ? 7 : 1 + Math.floor(rnd() * 3);
        for (let s = 0; s < nSlots; s++) {
          const hour = 7 + Math.floor(rnd() * 11) / 1 + (rnd() > 0.5 ? 0.5 : 0); // 07:00-17:30 UTC (09:00-19:30 Cairo)
          const start = at(off, Math.floor(hour), hour % 1 ? 30 : 0);
          if (mkOcc.has(`${d.key}|${start.getTime()}`)) continue;
          mkOcc.add(`${d.key}|${start.getTime()}`);
          const patient = pick(patInfo.filter((p) => p.clinic === d.clinic) as any[]) ?? pick(patInfo);
          const kind = chance(0.25) ? "follow" : "consult";
          let status: string; const r = rnd();
          if (off < 0) status = r < 0.72 ? "COMPLETED" : r < 0.86 ? "CANCELLED" : "NO_SHOW";
          else if (off === 0) status = start.getTime() < Date.now() - 2 * 3_600_000 ? "COMPLETED" : start.getTime() < Date.now() + 1_800_000 ? "CHECKED_IN" : r < 0.5 ? "CONFIRMED" : "SCHEDULED";
          else status = r < 0.08 ? "CANCELLED" : r < 0.6 ? "CONFIRMED" : "SCHEDULED";
          const source = pick(["FRONT_DESK", "FRONT_DESK", "PHONE", "WALK_IN", "CLINIC_LINK", "KIOREX_WHATSAPP"] as const);
          const row = mkAppt({ id: `demo_a_${tk}_${d.key}_${off + 50}_${s}`, d, patient: patient.id, start, status, source, kind });
          if (status === "COMPLETED") doEncounter(row, d);
        }
      }
    }
    // a live front-desk queue today (walk-ins already checked in / called / in exam), regardless of the clock
    if (T.key === "na") {
      (["WAITING", "WAITING", "CALLED", "IN_EXAM"] as const).forEach((stage, i) => {
        const d = T.docs[i]; const pat = patInfo.filter((p) => p.clinic === d.clinic)[i + 3];
        const row = mkAppt({ id: `demo_a_na_live_${i}`, d, patient: pat.id, start: new Date(Date.now() - (25 - i * 5) * 60000), status: "CHECKED_IN", source: "WALK_IN" });
        row.queueStage = stage; row.queueTicketNumber = 101 + i; row.calledAt = stage === "WAITING" ? null : new Date();
      });
    }
    await many("appointment", apptRows);
    await many("encounter", encRows); await many("diagnosis", dxRows); await many("encounterMedication", medRows);
    await many("prescriptionVerificationToken", tokRows);
    await many("clinicalOrder", orderRows); await many("clinicalOrderItem", orderItemRows);
    await many("invoice", invRows); await many("invoiceLine", lineRows); await many("billingPayment", payRows); await many("revenueEntry", revRows);
    await many("kiorexCommissionCharge", chargeRows);

    // ---- expenses, waitlist, recalls, messages, support ---------------------------------------------------------------
    const expRows: any[] = [];
    const CATS = [["Rent", 25000], ["Utilities", 4200], ["Medical supplies", 8800], ["Salaries", 60000], ["Marketing", 5000], ["Maintenance", 2600], ["Cleaning", 1800]] as const;
    for (let m = 0; m < 3; m++) for (const [i, [cat, amt]] of CATS.entries()) expRows.push({ id: `demo_x_${tk}_${m}_${i}`, tenantId: tid, clinicId: `demo_c_${tk}_${c0}`, category: cat, amount: Math.round(Number(amt) * (0.8 + rnd() * 0.4)), currency: "EGP", incurredAt: at(-m * 30 - i * 3 - 2, 9), vendorName: `Demo Vendor ${i + 1}`, status: m === 0 && i % 3 === 0 ? "PENDING" : m === 2 && i === 5 ? "REJECTED" : "APPROVED" });
    await many("expense", expRows);
    const wl = patInfo.slice(0, 6).map((p, i) => ({ id: `demo_w_${tk}_${i}`, tenantId: tid, clinicId: `demo_c_${tk}_${p.clinic}`, patientId: p.id, clinicianId: U(T.docs[i % T.docs.length].key), preferredFrom: at(1, 7), preferredTo: at(7, 17), status: (["WAITING", "WAITING", "OFFERED", "BOOKED", "CANCELLED", "WAITING"] as const)[i], notes: "Demo waitlist entry", source: i === 1 ? "KIOREX" : "FRONT_DESK" }));
    await many("appointmentWaitlistEntry", wl);
    await many("recallCampaign", [
      { id: `demo_rc_${tk}_1`, tenantId: tid, kind: "CHECKUP_DUE", nameEn: "Annual check-up due", nameAr: "موعد الفحص السنوي", active: true },
      { id: `demo_rc_${tk}_2`, tenantId: tid, kind: "LAPSED", nameEn: "Lapsed patients (6 months)", nameAr: "مرضى لم يزوروا منذ ٦ أشهر", active: true },
      { id: `demo_rc_${tk}_3`, tenantId: tid, kind: "BIRTHDAY", nameEn: "Birthday greeting", nameAr: "تهنئة عيد الميلاد", active: false },
    ]);
    const msgs: any[] = []; const out: any[] = [];
    patInfo.slice(0, 14).forEach((p, i) => {
      const pr = patRows.find((x) => x.id === p.id); const st = (["DELIVERED", "READ", "SENT", "FAILED"] as const)[i % 4]; const wa = i % 3 !== 2;
      msgs.push({ id: `demo_dm_${tk}_${i}`, tenantId: tid, channel: wa ? "whatsapp" : "email", direction: "OUTBOUND", toAddress: wa ? pr.phone : pr.email, templateKey: i % 2 ? "appointment_reminder" : "appointment_confirmation", subject: wa ? null : "Your appointment (demo)", bodyText: i % 2 ? `[DEMO] Reminder: you have an appointment tomorrow at ${T.name}.` : `[DEMO] Your appointment at ${T.name} is confirmed. / تم تأكيد موعدك`, status: st, createdAt: at(-(i % 6), 8) });
      out.push({ id: `demo_om_${tk}_${i}`, tenantId: tid, patientId: p.id, channel: wa ? "WHATSAPP" : "EMAIL", toPhone: pr.phone, body: `[DEMO] ${i % 2 ? "Reminder" : "Confirmation"} ${T.short}`, templateKey: i % 2 ? "appointment_reminder" : "appointment_confirmation", status: st, sentAt: at(-(i % 6), 8), createdAt: at(-(i % 6), 8), error: st === "FAILED" ? "DEMO mock: recipient not on WhatsApp" : null, attemptCount: st === "FAILED" ? 3 : 1 });
    });
    await many("devInboxMessage", msgs); await many("outboundMessage", out);

    // ---- billing / plan / credits ------------------------------------------------------------------------------------
    const plan = plans[T.plan]; const price = planPrices.find((p) => p.planId === plan.id && p.interval === "MONTHLY");
    if (!(await prisma.subscription.findUnique({ where: { tenantId: tid } }))) {
      await prisma.subscription.create({ data: { id: `demo_sub_${tk}`, tenantId: tid, planId: (T.trial ? plans.LITE : plan).id, planPriceId: price?.id, status: T.trial ? "TRIALING" : "ACTIVE", interval: "MONTHLY", clinicianSeats: T.docs.length, trialStartsAt: T.trial ? at(-5, 0) : null, trialEndsAt: T.trial ? at(9, 0) : null, trialPlanId: T.trial ? plan.id : null, currentPeriodStart: at(-12, 0), currentPeriodEnd: at(18, 0), activatedAt: T.trial ? null : at(-95, 0) } });
    }
    if (!T.trial) {
      const wid = `demo_w_${tk}`;
      await many("creditWallet", [{ id: wid, tenantId: tid, currency: "EGP", balance: 450 }]);
      await many("creditLedgerEntry", [
        { id: `demo_cl_${tk}_1`, walletId: wid, type: "GRANT", reason: "PROMO", amount: 300, remaining: 150, note: "DEMO welcome credit", createdAt: at(-70, 9) },
        { id: `demo_cl_${tk}_2`, walletId: wid, type: "CONSUME", reason: "ADJUSTMENT", amount: -150, note: "DEMO applied to invoice", createdAt: at(-40, 9) },
        { id: `demo_cl_${tk}_3`, walletId: wid, type: "GRANT", reason: "REFERRAL", amount: 300, remaining: 300, note: "DEMO referral credit", createdAt: at(-10, 9) },
      ]);
      const pm = Number(price?.amount ?? 1299);
      for (let m = 3; m >= 1; m--) {
        const iid = `demo_ki_${tk}_${m}`; const periodStart = at(-m * 30, 0); const key = `${periodStart.getUTCFullYear()}-${String(periodStart.getUTCMonth() + 1).padStart(2, "0")}`;
        const comm = T.key === "df" ? 60 * 3 : 0; const sub = pm; const tax = Math.round((sub + comm) * VAT) / 100; const total = sub + comm + tax;
        const status = m === 1 ? (T.key === "df" ? "PARTIALLY_PAID" : "ISSUED") : "PAID";
        await many("kiorlyInvoice", [{ id: iid, tenantId: tid, number: `KDEMO-${tk.toUpperCase()}-${key}`, periodKey: key, periodStart, periodEnd: at(-m * 30 + 30, 0), currency: "EGP", subtotal: sub + comm, tax, total, status, amountPaid: status === "PAID" ? total : status === "PARTIALLY_PAID" ? Math.round(total / 2) : 0, issuedAt: periodStart, dueAt: m === 1 && status !== "PAID" ? at(10, 0) : at(-m * 30 + 14, 0), paidAt: status === "PAID" ? at(-m * 30 + 3, 0) : null }]);
        await many("kiorlyInvoiceLine", [
          { id: `${iid}_1`, invoiceId: iid, type: "SUBSCRIPTION", descEn: `${plan.nameEn} plan (monthly)`, descAr: `باقة ${plan.nameAr} (شهري)`, quantity: 1, unitAmount: sub, amount: sub },
          ...(comm ? [{ id: `${iid}_2`, invoiceId: iid, type: "KIOREX_COMMISSION", descEn: "Kiorex marketplace commission (3 attended new patients, DEMO rate)", descAr: "عمولة كيوريكس (٣ مرضى جدد) - سعر تجريبي", quantity: 3, unitAmount: 60, amount: comm }] : []),
          { id: `${iid}_t`, invoiceId: iid, type: "TAX", descEn: `VAT ${VAT}% (configured)`, descAr: `ضريبة القيمة المضافة ${VAT}% (إعداد)`, quantity: 1, unitAmount: tax, amount: tax },
        ]);
        if (status !== "ISSUED") await many("kiorlyPayment", [{ id: `demo_kp_${tk}_${m}`, tenantId: tid, invoiceId: iid, provider: "mock", providerRef: `mock_${tk}_${m}`, amount: status === "PAID" ? total : Math.round(total / 2), currency: "EGP", status: "SUCCEEDED", createdAt: at(-m * 30 + 3, 0) }]);
      }
    }
    summary.push(`${T.name}: ${T.clinics.length} clinics, ${T.docs.length} doctors, ${patRows.length} patients, ${apptRows.length} appointments (${Object.entries(stat).map(([k, v]) => `${k}:${v}`).join(" ")}), ${encRows.length} encounters, ${invRows.length} invoices`);
  }
  // Rev 2.3: Nurse edition tenants, physio, registrations, home visits, care plans, MAR (needs the three tenants above)
  summary.push("Rev 2.3: " + (await seedRev23(prisma, { at, reset: RESET })));
  console.log("Kiorly demo seed OK\n  " + summary.join("\n  ") + `\n  logins: <role>.<na|df|ss>@demo.kiorex.test / ${DEMO_PASSWORD} (DEV ONLY) — see /TEST_DATA.md`);
}

type Case = { cc: string; s: string; o: string; a: string; p: string; icd: string; dx: string; dxAr: string; meds: string[][]; lab?: [string, string[][]]; proc?: string };
const SPEC_CLIN: Record<string, { cases: Case[] }> = {
  PEDIATRICS: { cases: [
    { cc: "Fever and cough for 3 days", s: "Child with fever up to 38.8, dry cough, reduced appetite.", o: "Throat injected, chest clear, no rash.", a: "Acute viral upper respiratory infection", p: "Fluids, antipyretic, review if fever persists >72h.", icd: "J06.9", dx: "Acute upper respiratory infection", dxAr: "التهاب الجهاز التنفسي العلوي", meds: [["Paracetamol 120mg/5ml", "5 ml", "q6h PRN", "3 days"]], lab: ["LAB", [["CBC", "صورة دم كاملة", "CBC", "7.2", "10^9/L"], ["CRP", "بروتين سي التفاعلي", "CRP", "6", "mg/L"]]] },
    { cc: "Routine vaccination visit", s: "Well child, feeding and growth normal.", o: "Growth along 50th centile, development appropriate.", a: "Healthy child, vaccination due", p: "Vaccine given, next visit in 2 months.", icd: "Z00.1", dx: "Routine child health examination", dxAr: "فحص صحة الطفل الدوري", meds: [] },
  ] },
  DERMATOLOGY: { cases: [
    { cc: "Itchy rash on forearms", s: "2-week itchy erythematous patches, worse at night.", o: "Eczematous plaques on both forearms.", a: "Atopic dermatitis", p: "Emollients, topical steroid 7 days.", icd: "L20.9", dx: "Atopic dermatitis", dxAr: "التهاب الجلد التأتبي", meds: [["Hydrocortisone 1% cream", "thin layer", "BID", "7 days"], ["Cetirizine 10mg", "1 tab", "nightly", "7 days"]] },
    { cc: "Acne flare", s: "Facial acne for months, no response to OTC.", o: "Inflammatory papules and comedones on cheeks.", a: "Acne vulgaris, moderate", p: "Topical retinoid + benzoyl peroxide, review 6 weeks.", icd: "L70.0", dx: "Acne vulgaris", dxAr: "حب الشباب", meds: [["Adapalene 0.1% gel", "pea-sized", "nightly", "6 weeks"]], proc: "Chemical peel session" },
  ] },
  CARDIOLOGY: { cases: [
    { cc: "Palpitations and fatigue", s: "Episodes of palpitations, no syncope.", o: "BP 142/90, regular rhythm, no murmurs.", a: "Hypertension, palpitations — Holter requested", p: "Start ACE inhibitor, low-salt diet, ECG + echo.", icd: "I10", dx: "Essential hypertension", dxAr: "ارتفاع ضغط الدم الأساسي", meds: [["Ramipril 5mg", "1 tab", "daily", "30 days"], ["Aspirin 75mg", "1 tab", "daily", "30 days"]], lab: ["LAB", [["Lipid profile - LDL", "الدهون - LDL", "LDL", "128", "mg/dL"], ["Creatinine", "الكرياتينين", "CREA", "0.9", "mg/dL"]]], proc: "ECG" },
    { cc: "Chest tightness on exertion", s: "Exertional tightness for 2 weeks, relieved by rest.", o: "Normal exam, ECG normal.", a: "Suspected stable angina — stress test", p: "Exercise ECG, statin, review with results.", icd: "I20.9", dx: "Angina pectoris, unspecified", dxAr: "الذبحة الصدرية", meds: [["Atorvastatin 20mg", "1 tab", "nightly", "30 days"]], lab: ["IMAGING", [["Echocardiogram", "إيكو على القلب", "ECHO", "EF 60%", ""]]] },
  ] },
  OBSTETRICS_GYNECOLOGY: { cases: [
    { cc: "Antenatal check-up, 24 weeks", s: "Uncomplicated pregnancy, good fetal movements.", o: "Fundal height appropriate, FHR 144.", a: "Normal pregnancy 24 weeks", p: "Routine labs, next visit 4 weeks.", icd: "Z34.0", dx: "Supervision of normal pregnancy", dxAr: "متابعة حمل طبيعي", meds: [["Folic acid 5mg", "1 tab", "daily", "30 days"], ["Iron + Vit C", "1 cap", "daily", "30 days"]], lab: ["IMAGING", [["Obstetric ultrasound", "سونار حمل", "USG", "Normal", ""]]] },
    { cc: "Irregular periods", s: "Cycles 40-50 days for 6 months.", o: "BMI 29, no hirsutism.", a: "Oligomenorrhoea — PCOS work-up", p: "Hormone profile + pelvic ultrasound.", icd: "N91.5", dx: "Oligomenorrhoea", dxAr: "قلة الطمث", meds: [], lab: ["LAB", [["TSH", "الغدة الدرقية TSH", "TSH", "2.1", "mIU/L"], ["Prolactin", "البرولاكتين", "PRL", "14", "ng/mL"]]] },
  ] },
  DENTISTRY: { cases: [
    { cc: "Tooth pain lower right", s: "Pain with hot/cold for a week.", o: "Deep caries on 46, percussion negative.", a: "Reversible pulpitis tooth 46", p: "Composite filling placed today.", icd: "K02.1", dx: "Dental caries of dentine", dxAr: "تسوس الأسنان", meds: [["Ibuprofen 400mg", "1 tab", "TID PRN", "3 days"]], proc: "Composite filling" },
    { cc: "Scaling and polishing", s: "Routine hygiene visit.", o: "Moderate calculus, gingivitis.", a: "Chronic gingivitis", p: "Scaling done, oral hygiene advice.", icd: "K05.1", dx: "Chronic gingivitis", dxAr: "التهاب اللثة المزمن", meds: [], proc: "Scaling & polishing" },
  ] },
  ORTHOPEDICS: { cases: [
    { cc: "Knee pain after football", s: "Twisting injury 5 days ago, swelling.", o: "Mild effusion, ligaments stable, McMurray equivocal.", a: "Knee sprain, rule out meniscal tear", p: "RICE, NSAID, MRI if no improvement in 2 weeks.", icd: "S83.6", dx: "Sprain of the knee", dxAr: "التواء الركبة", meds: [["Diclofenac 50mg", "1 tab", "BID", "5 days"]], lab: ["IMAGING", [["X-ray knee AP/lat", "أشعة على الركبة", "XR-KNEE", "No fracture", ""]]] },
    { cc: "Lower back pain", s: "Chronic mechanical LBP, desk worker.", o: "Paraspinal spasm, SLR negative.", a: "Mechanical low back pain", p: "Physiotherapy, posture advice.", icd: "M54.5", dx: "Low back pain", dxAr: "ألم أسفل الظهر", meds: [["Thiocolchicoside 4mg", "1 cap", "BID", "5 days"]] },
  ] },
  ENT: { cases: [
    { cc: "Sore throat and ear pain", s: "3 days of throat pain, right otalgia.", o: "Tonsillar exudate, TM dull.", a: "Acute tonsillitis with otitis media", p: "Antibiotic course, analgesia.", icd: "J03.9", dx: "Acute tonsillitis", dxAr: "التهاب اللوزتين الحاد", meds: [["Amoxicillin/clavulanate 625mg", "1 tab", "BID", "7 days"]] },
    { cc: "Nasal congestion", s: "Chronic blocked nose, snoring.", o: "Deviated septum, turbinate hypertrophy.", a: "Chronic rhinitis, DNS", p: "Nasal steroid spray, review 4 weeks.", icd: "J31.0", dx: "Chronic rhinitis", dxAr: "التهاب الأنف المزمن", meds: [["Mometasone nasal spray", "2 sprays", "daily", "30 days"]] },
  ] },
  INTERNAL_MEDICINE: { cases: [
    { cc: "Diabetes follow-up", s: "Type 2 DM on metformin, occasional hypoglycaemia.", o: "BP 130/80, BMI 31.", a: "T2DM — HbA1c review", p: "Continue metformin, lifestyle, HbA1c in 3 months.", icd: "E11.9", dx: "Type 2 diabetes mellitus", dxAr: "السكري من النوع الثاني", meds: [["Metformin 850mg", "1 tab", "BID", "30 days"]], lab: ["LAB", [["HbA1c", "السكر التراكمي", "HBA1C", "7.4", "%"], ["Fasting glucose", "سكر صائم", "FBG", "132", "mg/dL"]]] },
    { cc: "Heartburn and bloating", s: "Post-meal burning for a month.", o: "Epigastric tenderness.", a: "GERD", p: "PPI 4 weeks, avoid trigger foods.", icd: "K21.9", dx: "Gastro-oesophageal reflux disease", dxAr: "ارتجاع المريء", meds: [["Esomeprazole 40mg", "1 cap", "daily", "28 days"]] },
  ] },
  FAMILY_MEDICINE: { cases: [
    { cc: "Flu-like illness", s: "Body aches, fever and cough for 2 days.", o: "Temp 38.2, chest clear.", a: "Influenza-like illness", p: "Rest, fluids, paracetamol.", icd: "J11.1", dx: "Influenza-like illness", dxAr: "أعراض الانفلونزا", meds: [["Paracetamol 500mg", "1 tab", "q6h PRN", "3 days"]] },
  ] },
  OPHTHALMOLOGY: { cases: [
    { cc: "Blurred vision", s: "Gradual blur at distance.", o: "VA 6/12 OU improving with pinhole.", a: "Myopia", p: "Refraction and glasses.", icd: "H52.1", dx: "Myopia", dxAr: "قصر النظر", meds: [] },
  ] },
  GENERAL_MEDICINE: { cases: [
    { cc: "General check-up", s: "No complaints.", o: "Normal examination.", a: "Healthy adult", p: "Routine labs, review in 1 year.", icd: "Z00.0", dx: "General medical examination", dxAr: "فحص طبي عام", meds: [] },
  ] },
};

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
