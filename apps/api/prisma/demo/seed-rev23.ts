/**
 * Kiorly Clinic / Kiorly Nurse Rev 2.3 DEMO data (synthetic, DEV ONLY — see /TEST_DATA.md and Docs/TEST_DATA.md).
 *
 *   npm run db:seed:demo -w api            (called at the end of seed-demo.ts, idempotent)
 *   npm run db:seed:demo:rev23 -w api      standalone (needs the base demo tenants na/df/ss and the EG market)
 *
 * What it adds (all keyed by deterministic ids `demo_*`, written with skipDuplicates / upserts, never touching non-demo tenants):
 *   - the two Nurse-edition tenants of `db:seed:nurse` (solo "Demo Home Nursing (Mona)", agency "Demo Care Agency": dispatcher, 5 nurses, aide)
 *     extended with client patients, roster profiles, home settings (coverage districts), Kiorex listings and Passport identity links
 *   - physiotherapists (Nile Care, Delta) with the physio pack entitlement, assessments, plans, progress notes, outcome measures, a HEP link
 *   - professional registrations / verification in EVERY state (UNVERIFIED, PENDING, VERIFIED, REJECTED, EXPIRED)
 *   - home-visit-enabled providers + HOME appointment types, and home bookings in every state (assigned, en route, arrived, finished,
 *     aborted-unsafe, cancelled, no-show, requested), encrypted addresses (masked 24 h after the visit), geostamps, safety alerts, incidents
 *   - care plans (agency client), nursing visit records, vitals (one critical + escalation), doctor orders + MAR, private-duty shifts
 * The Kiorex side of every origin=KIOREX visit lives in kiorex-platform (same demo-home-visits.json). Gates are NOT recorded here.
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encryptVisitAddress } from "../../src/home-visits/address-crypto";
import { NURSE_DEMO_PASSWORD, NURSE_DEMO_TENANT_NAMES, ensureNurseDemoTenants } from "../nurse-demo.seed";
import { NURSE_SERVICE_CATALOGUE } from "../../src/nurse/nurse-services";
import { PERSONAS } from "./demo-data";

const DAY = 86_400_000;
const MIN = 60_000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const PASSPORT_ISSUER = process.env.KIOREX_OIDC_ISSUER?.trim().replace(/\/+$/, "") || "http://localhost:4400";
/** Passport (kiorex-account) subjects of the Nurse demo personas — keep in sync with kiorex-account/config/seed-users.json. */
const sub = (n: number) => `01HZKXD${String(n).padStart(19, "0")}`;
const NURSE_PASSPORT: Record<string, number> = {
  "mona@nurse-demo.kiorly.test": 3001, "owner@nurse-demo.kiorly.test": 3002, "dispatch@nurse-demo.kiorly.test": 3003, "nurse1@nurse-demo.kiorly.test": 3004,
  "nurse2@nurse-demo.kiorly.test": 3005, "aide@nurse-demo.kiorly.test": 3006, "nurse3@nurse-demo.kiorly.test": 3007, "nurse4@nurse-demo.kiorly.test": 3008, "nurse5@nurse-demo.kiorly.test": 3009,
  "mai@demo.kiorex.test": 3010,
};

type Alert = { id: string; kind: "SOS" | "UNSAFE_ABORT" | "TIMER_EXPIRED"; raisedRel: number; kiorlyStatus: string; kiorexStatus: string };
export type HvSpec = {
  key: string; provider: string; phone: string; addr?: string; svc: string; dependant?: string; name?: string[]; t: { off?: number; hour?: number; rel?: number };
  origin: "KIOREX" | "PHONE" | "FRONT_DESK"; appt: string; hv: string; assigned?: string | null; enRouteRel?: number; arrivedRel?: number; etaMinutes?: number;
  abortRel?: number; abortReason?: string; abortCategory?: string; cancelledBy?: string; record?: boolean; criticalVitals?: boolean; alerts?: Alert[];
};
export type HvJson = {
  providers: Record<string, { nameEn: string; nameAr: string; tenant: string }>;
  addresses: Record<string, { key: string; label: string; governorate: string; district: string; street: string; building?: string; floor?: string; flat?: string; landmark?: string; lat?: number; lng?: number }[]>;
  visits: HvSpec[];
  carePlans: { key: string; provider: string; phone: string; addr: string; svc: string; title: string; startOff: number; count: number; hour: number; nurse: string; requestRef: string }[];
};

type Ctx = { prisma: PrismaClient; marketId: string; mpClientId: string; now: Date; at: (off: number, hour: number, min?: number) => Date };

async function many(prisma: PrismaClient, model: string, rows: any[]) {
  for (let i = 0; i < rows.length; i += 500) await (prisma as any)[model].createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
}

const WEEK_ALL_DAY = { version: 1, timezone: "Africa/Cairo", days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, slots: [{ start: "08:00", end: "20:00" }] })) };

export async function seedRev23(prisma: PrismaClient, opts: { at: (off: number, hour: number, min?: number) => Date; reset?: boolean }): Promise<string> {
  const { at } = opts;
  // seed-all.sh exports DEMO_SEED_NOW so the Kiorex seed anchors the live (relative-time) visits to the same instant
  const now = process.env.DEMO_SEED_NOW ? new Date(process.env.DEMO_SEED_NOW) : new Date();
  const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
  const mp = await prisma.platformIntegrationClient.findUnique({ where: { clientKey: "kx_dev_client" } });
  if (!mp) throw new Error("kx_dev_client missing: run `npm run db:seed -w api` first");
  const ctx: Ctx = { prisma, marketId: market.id, mpClientId: mp.id, now, at };
  const hvJson = JSON.parse(readFileSync(join(__dirname, "demo-home-visits.json"), "utf8")) as HvJson;
  const passwordHash = bcrypt.hashSync(NURSE_DEMO_PASSWORD, 10);
  const log: string[] = [];

  // ──────────────────────────── 1. Nurse tenants (solo + agency) ────────────────────────────
  const nd = await ensureNurseDemoTenants(prisma);
  const T = { nsolo: nd.solo.tenantId, nagy: nd.agency.tenantId, na: "demo_t_na", df: "demo_t_df", ss: "demo_t_ss" } as Record<string, string>;
  for (const k of ["na", "df", "ss"]) if (!(await prisma.tenant.findUnique({ where: { id: T[k] } }))) throw new Error(`demo tenant ${T[k]} missing: run seed-demo first`);
  const clinicOf: Record<string, string> = {};
  for (const k of ["nsolo", "nagy"]) clinicOf[k] = (await prisma.clinic.findFirstOrThrow({ where: { tenantId: T[k] }, orderBy: { createdAt: "asc" } })).id;
  clinicOf.na = "demo_c_na_maadi"; clinicOf.df = "demo_c_df_mansoura";

  // one password for every demo login (older runs used "demo")
  await prisma.user.updateMany({ where: { email: { endsWith: "@nurse-demo.kiorly.test" } }, data: { passwordHash } });
  const nurseUsers = await prisma.user.findMany({ where: { tenantId: { in: [T.nsolo, T.nagy] } } });
  const uByEmail = new Map(nurseUsers.map((u) => [u.email, u]));
  const nu = (local: string) => uByEmail.get(`${local}@nurse-demo.kiorly.test`)!;
  const U: Record<string, string> = { mona: nu("mona").id, nurse1: nu("nurse1").id, nurse2: nu("nurse2").id, nurse3: nu("nurse3").id, nurse4: nu("nurse4").id, nurse5: nu("nurse5").id, dispatch: nu("dispatch").id, aide: nu("aide").id, agyowner: nu("owner").id, nadia: "demo_u_na_nadia" };

  // physiotherapists in the two clinic-edition demo tenants (existing users are never touched)
  const physio = [
    { id: "demo_u_na_mai", tenantId: T.na, email: "mai.na@demo.kiorex.test", displayName: "Dr Mai Hassan" },
    { id: "demo_u_df_hany", tenantId: T.df, email: "hany.df@demo.kiorex.test", displayName: "Dr Hany Sobhy" },
  ];
  for (const p of physio) {
    if (!(await prisma.user.findUnique({ where: { id: p.id } })) && !(await prisma.user.findFirst({ where: { email: p.email } }))) {
      await prisma.user.create({ data: { ...p, passwordHash, role: "PHYSICIAN", profession: "PHYSIOTHERAPIST" } });
    }
  }
  U.mai = "demo_u_na_mai"; U.hany = "demo_u_df_hany";
  const physioEmail = new Map<string, string>([["mai", "mai.na@demo.kiorex.test"]]);

  // the nurse clinics have an office address + pin so the Kiorex profile is complete (>= 80 %)
  await prisma.clinic.updateMany({ where: { id: { in: [clinicOf.nsolo, clinicOf.nagy] }, latitude: null }, data: { latitude: 30.0626, longitude: 31.3219 } });

  // ──────────────────────────── 2. appointment types (HOME + physio) ────────────────────────────
  const typeOfSvc: Record<string, Record<string, { id: string; nameEn: string; fee: number; dur: number; surcharge: number; deposit: number }>> = { nsolo: {}, nagy: {}, na: {}, df: {} };
  for (const k of ["nsolo", "nagy"] as const) {
    for (const s of NURSE_SERVICE_CATALOGUE) {
      const row = await prisma.appointmentType.findFirst({ where: { tenantId: T[k], nameEn: s.nameEn } });
      if (!row) continue;
      const bookable = ["injection", "iv_cannula_infusion", "wound_dressing", "vitals_monitoring", "elderly_care_visit", "post_operative_care"].includes(s.code);
      const upd = await prisma.appointmentType.update({ where: { id: row.id }, data: { marketplaceBookable: bookable, homeSurchargeAmount: 40, depositAmount: bookable ? 100 : null, minNoticeMinutes: 0, serviceLocation: "HOME" } });
      typeOfSvc[k][s.code] = { id: upd.id, nameEn: upd.nameEn, fee: Number(upd.feeAmount), dur: upd.durationMinutes, surcharge: 40, deposit: bookable ? 100 : 0 };
    }
  }
  const mkType = async (k: "na" | "df", id: string, nameEn: string, nameAr: string, dur: number, fee: number, home: boolean, surcharge = 0, deposit: number | null = null) => {
    await prisma.appointmentType.upsert({
      where: { id },
      create: { id, tenantId: T[k], clinicId: clinicOf[k], nameEn, nameAr, durationMinutes: dur, feeAmount: fee, marketplaceBookable: true, isActive: true, serviceLocation: home ? "HOME" : "IN_CLINIC", bufferBeforeMin: home ? 30 : 0, bufferAfterMin: home ? 30 : 0, homeSurchargeAmount: home ? surcharge : null, depositAmount: deposit, minNoticeMinutes: 0, colorHex: home ? "#e11d48" : "#14b8a6" },
      update: {},
    });
    return { id, nameEn, fee, dur, surcharge, deposit: deposit ?? 0 };
  };
  typeOfSvc.na.doctor_home = await mkType("na", "demo_ty_na_maadi_home", "Home visit", "زيارة منزلية", 45, 600, true, 150, 200);
  typeOfSvc.na.physio_home = await mkType("na", "demo_ty_na_maadi_physiohome", "Physio home session", "جلسة علاج طبيعي منزلية", 45, 450, true, 100);
  typeOfSvc.na.physio_clinic = await mkType("na", "demo_ty_na_maadi_physio", "Physio session", "جلسة علاج طبيعي", 45, 350, false);
  typeOfSvc.df.physio_home = await mkType("df", "demo_ty_df_mansoura_physiohome", "Physio home session", "جلسة علاج طبيعي منزلية", 45, 350, true, 80);
  typeOfSvc.df.physio_clinic = await mkType("df", "demo_ty_df_mansoura_physio", "Physio session", "جلسة علاج طبيعي", 45, 280, false);

  // ──────────────────────────── 3. verification + registrations (every state) ────────────────────────────
  type Reg = { code: string; no: string; status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED"; exp?: number | null; issued?: number };
  type Ver = { user: string; tenant: string; prof: "NURSE" | "PHYSIOTHERAPIST"; status: Reg["status"]; syn: string; solo?: boolean; regs: Reg[]; reject?: [string, string]; reverify?: string; pendingDaysAgo?: number; spec?: string };
  const NURSE_REG = (n: string, moh: Reg["status"] = "VERIFIED", exp: number | null = 240): Reg[] => [{ code: "EG_NURSING_SYNDICATE", no: `DEMO-NRS-${n}`, status: moh === "UNVERIFIED" ? "UNVERIFIED" : moh === "REJECTED" ? "REJECTED" : "VERIFIED", issued: -900 }, { code: "EG_MOH_LICENCE", no: `DEMO-MOH-N-${n}`, status: moh, exp, issued: -500 }];
  const vers: Ver[] = [
    { user: U.mona, tenant: "nsolo", prof: "NURSE", status: "VERIFIED", syn: "DEMO-NRS-0001", solo: true, regs: NURSE_REG("0001") },
    { user: U.nurse1, tenant: "nagy", prof: "NURSE", status: "VERIFIED", syn: "DEMO-NRS-0002", regs: NURSE_REG("0002") },
    { user: U.nurse2, tenant: "nagy", prof: "NURSE", status: "VERIFIED", syn: "DEMO-NRS-0003", regs: NURSE_REG("0003", "VERIFIED", 18) },
    { user: U.nurse3, tenant: "nagy", prof: "NURSE", status: "REJECTED", syn: "DEMO-NRS-0004", regs: NURSE_REG("0004", "REJECTED", null), reject: ["Syndicate card photo unreadable (demo)", "DOCUMENT_UNREADABLE"] },
    { user: U.nurse4, tenant: "nagy", prof: "NURSE", status: "EXPIRED", syn: "DEMO-NRS-0005", regs: NURSE_REG("0005", "EXPIRED", -12), reverify: "LICENCE_EXPIRED" },
    { user: U.nurse5, tenant: "nagy", prof: "NURSE", status: "UNVERIFIED", syn: "", regs: NURSE_REG("0006", "UNVERIFIED", null) },
    { user: U.mai, tenant: "na", prof: "PHYSIOTHERAPIST", status: "VERIFIED", syn: "DEMO-PT-0001", spec: "PHYSIO_THERAPY", regs: [{ code: "EG_PHYSICAL_THERAPY_SYNDICATE", no: "DEMO-PT-0001", status: "VERIFIED", issued: -1200 }, { code: "EG_MOH_PHYSIOTHERAPY_LICENCE", no: "DEMO-MOH-PT-0001", status: "VERIFIED", exp: 300, issued: -400 }] },
    { user: U.hany, tenant: "df", prof: "PHYSIOTHERAPIST", status: "VERIFIED", syn: "DEMO-PT-0002", spec: "PHYSIO_THERAPY", regs: [{ code: "EG_PHYSICAL_THERAPY_SYNDICATE", no: "DEMO-PT-0002", status: "VERIFIED", issued: -800 }, { code: "EG_MOH_PHYSIOTHERAPY_LICENCE", no: "DEMO-MOH-PT-0002", status: "PENDING", exp: 20, issued: -10 }] },
  ];
  const verRows: any[] = []; const regRows: any[] = [];
  for (const v of vers) {
    const verified = v.status === "VERIFIED";
    verRows.push({
      id: `demo_v_rev23_${v.user.replace("demo_u_", "")}`, userId: v.user, tenantId: T[v.tenant], status: v.status, profession: v.prof, verifiedProfession: verified ? v.prof : null,
      syndicateNumber: v.syn || null, specialty: v.spec ?? null, verifiedSpecialty: verified ? v.spec ?? null : null, titleEn: v.prof === "NURSE" ? "Registered Nurse" : "Physiotherapist", titleAr: v.prof === "NURSE" ? "ممرض/ة مسجل/ة" : "أخصائي علاج طبيعي",
      isSolo: !!v.solo, documentKeys: v.status === "UNVERIFIED" ? [] : v.solo ? ["demo/id-front.png", "demo/id-selfie.png", "demo/syndicate-card.png"] : ["demo/syndicate-card.png"],
      rejectReason: v.reject?.[0] ?? null, rejectReasonCode: v.reject?.[1] ?? null, reverifyReason: v.reverify ?? null,
      pendingAt: v.status === "PENDING" ? at(-2, 9) : null, reviewedAt: ["VERIFIED", "REJECTED", "EXPIRED"].includes(v.status) ? at(-40, 10) : null, verifiedAt: verified || v.status === "EXPIRED" ? at(-40, 10) : null,
      verifiedName: verified ? undefined : null, nextReverifyAt: verified ? at(320, 0) : v.status === "EXPIRED" ? at(-12, 0) : null,
    });
    v.regs.forEach((r, i) => regRows.push({ id: `demo_pr_${v.user.replace("demo_u_", "")}_${i}`, tenantId: T[v.tenant], userId: v.user, verificationId: `demo_v_rev23_${v.user.replace("demo_u_", "")}`, profession: v.prof, registerCode: r.code, registrationNumber: r.no, issuedAt: r.issued != null ? at(r.issued, 0) : null, expiresAt: r.exp != null ? at(r.exp, 0) : null, status: r.status, verifiedAt: r.status === "VERIFIED" ? at(-40, 10) : null }));
  }
  // the original demo doctors: syndicate registrations that mirror their verification; one licence about to expire; Dr Samah (listing PAUSED) has an EXPIRED licence
  const docVer = await prisma.clinicianVerification.findMany({ where: { tenantId: { in: [T.na, T.df, T.ss] }, id: { startsWith: "demo_v_" }, NOT: { id: { startsWith: "demo_v_rev23" } } } });
  for (const [i, dv] of docVer.entries()) {
    const pending = dv.status === "PENDING";
    regRows.push({ id: `demo_pr_${dv.userId.replace("demo_u_", "")}_0`, tenantId: dv.tenantId, userId: dv.userId, verificationId: dv.id, profession: "PHYSICIAN", registerCode: dv.specialty === "DENTISTRY" ? "EG_DENTISTS_SYNDICATE" : "EG_MEDICAL_SYNDICATE", registrationNumber: dv.syndicateNumber ?? `DEMO-SYN-${i}`, issuedAt: at(-1500, 0), status: pending ? "PENDING" : "VERIFIED", verifiedAt: pending ? null : at(-60, 10) });
    if (!pending && i % 3 === 0 && dv.userId !== "demo_u_df_samah") regRows.push({ id: `demo_pr_${dv.userId.replace("demo_u_", "")}_1`, tenantId: dv.tenantId, userId: dv.userId, verificationId: dv.id, profession: "PHYSICIAN", registerCode: "EG_MOH_LICENCE", registrationNumber: `DEMO-MOH-D-${i}`, issuedAt: at(-700, 0), expiresAt: at(i === 3 ? 25 : 365, 0), status: "VERIFIED", verifiedAt: at(-60, 10) });
  }
  await prisma.clinicianVerification.upsert({ where: { userId: "demo_u_df_samah" }, update: { status: "EXPIRED", reverifyReason: "LICENCE_EXPIRED", nextReverifyAt: at(-12, 0) }, create: { id: "demo_v_df_samah_x", userId: "demo_u_df_samah", tenantId: T.df, status: "EXPIRED" } }).catch(() => undefined);
  regRows.push({ id: "demo_pr_df_samah_1", tenantId: T.df, userId: "demo_u_df_samah", verificationId: "demo_v_df_samah", profession: "PHYSICIAN", registerCode: "EG_MOH_LICENCE", registrationNumber: "DEMO-MOH-D-SAMAH", issuedAt: at(-900, 0), expiresAt: at(-12, 0), status: "EXPIRED" });
  await many(prisma, "clinicianVerification", verRows);
  await many(prisma, "professionalRegistration", regRows);

  // ──────────────────────────── 4. availability, home settings, listings, entitlements, identity links ────────────────────────────
  const staff: { user: string; tenant: string; display: string; displayAr: string; coverage: string[]; cap?: number; listing?: "LIVE" | "PENDING_VERIFICATION" | "PAUSED" | null; spec?: string; title?: string; titleAr?: string }[] = [
    { user: U.mona, tenant: "nsolo", display: "Nurse Mona Adel", displayAr: "الممرضة منى عادل", coverage: ["nasr-city", "heliopolis", "new-cairo"], cap: 8, listing: "LIVE", title: "Registered Nurse (home)", titleAr: "ممرضة مسجلة (زيارات منزلية)" },
    { user: U.nurse1, tenant: "nagy", display: "Demo Care Agency", displayAr: "شركة رعاية تجريبية", coverage: ["nasr-city", "heliopolis", "maadi", "zamalek"], cap: 6, listing: "LIVE", title: "Home nursing agency", titleAr: "شركة تمريض منزلي" },
    { user: U.nurse2, tenant: "nagy", display: "Salma Nurse", displayAr: "سلمى", coverage: ["heliopolis", "nasr-city", "new-cairo", "maadi"], cap: 6, listing: null },
    { user: U.nurse3, tenant: "nagy", display: "Nadine Nurse", displayAr: "نادين", coverage: ["maadi"], listing: null },
    { user: U.nurse4, tenant: "nagy", display: "Rawan Nurse", displayAr: "روان", coverage: ["nasr-city"], listing: null },
    { user: U.nurse5, tenant: "nagy", display: "Yara Nurse", displayAr: "يارا", coverage: ["zamalek", "maadi"], listing: null },
    { user: U.mai, tenant: "na", display: "Dr Mai Hassan", displayAr: "د. مي حسن", coverage: ["maadi", "nasr-city", "heliopolis"], cap: 5, listing: "LIVE", spec: "PHYSIO_THERAPY", title: "Physiotherapist", titleAr: "أخصائي علاج طبيعي" },
    { user: U.nadia, tenant: "na", display: "Dr Nadia Fouad", displayAr: "د. نادية فؤاد", coverage: ["maadi", "heliopolis", "zamalek"], cap: 3 },
    { user: U.hany, tenant: "df", display: "Dr Hany Sobhy", displayAr: "د. هاني صبحي", coverage: ["mansoura"], cap: 4, listing: "LIVE", spec: "PHYSIO_THERAPY", title: "Physiotherapist", titleAr: "أخصائي علاج طبيعي" },
  ];
  for (const s of staff) {
    const tenantId = T[s.tenant]; const clinicId = clinicOf[s.tenant];
    await prisma.clinicianHomeSettings.upsert({ where: { tenantId_clinicianId: { tenantId, clinicianId: s.user } }, create: { tenantId, clinicianId: s.user, acceptsHomeVisits: true, coverageDistrictIds: s.coverage, dailyVisitCap: s.cap ?? null, maxTravelMinutes: 45 }, update: { acceptsHomeVisits: true, coverageDistrictIds: s.coverage, dailyVisitCap: s.cap ?? null } });
    if (s.user !== U.nadia) {
      await prisma.clinicianAvailabilityTemplate.upsert({ where: { tenantId_clinicId_clinicianId: { tenantId, clinicId, clinicianId: s.user } }, create: { id: `demo_av_rev23_${s.user.replace("demo_u_", "")}`, tenantId, clinicId, clinicianId: s.user, weekJson: WEEK_ALL_DAY, blockedJson: [], marketplaceDailyCap: 20 }, update: {} });
    }
    if (s.listing) {
      const types = Object.values(typeOfSvc[s.tenant]).filter((t) => (s.tenant === "nsolo" || s.tenant === "nagy" ? true : t.id.includes("physio")));
      const profile = { displayNameEn: s.display, displayNameAr: s.displayAr, titleEn: s.title, titleAr: s.titleAr, specialty: s.spec ?? "GENERAL_MEDICINE", gender: "FEMALE", languages: ["ar", "en"], bioEn: `Demo profile (synthetic data): ${s.title}, home visits by appointment.`, bioAr: `ملف تجريبي (بيانات وهمية): ${s.titleAr}، زيارات منزلية بالموعد.`, education: [{ degreeEn: "Diploma / BSc, demo institute", degreeAr: "دبلوم / بكالوريوس، معهد تجريبي" }], yearsExperience: 8, feesByAppointmentTypeId: Object.fromEntries(types.map((t) => [t.id, t.fee])), amenities: ["home_visits"], parking: false, wheelchairAccess: false };
      await prisma.marketplaceListing.upsert({
        where: { clinicId_clinicianId: { clinicId, clinicianId: s.user } },
        create: { id: `demo_l_rev23_${s.user.replace("demo_u_", "")}`, tenantId, clinicId, clinicianId: s.user, status: s.listing, listedAt: s.listing === "LIVE" ? at(-30, 9) : null, bookingSlug: `demo-${s.user.replace("demo_u_", "").replace(/_/g, "-")}`, profileJson: profile },
        update: { status: s.listing, profileJson: profile },
      });
    }
  }
  // Kiorex listing for Yara is deliberately absent (profession not verified); nothing else to seed.
  for (const tk of ["na", "df"]) await prisma.tenantEntitlementOverride.upsert({ where: { tenantId_key: { tenantId: T[tk], key: "pack_physio" } }, create: { tenantId: T[tk], key: "pack_physio", valueJson: true, reason: "DEV demo: physio pack enabled (price PROPOSED, NEEDS_HUMAN)", createdBy: "DEMO_SEED" }, update: {} });
  // Sign in with Kiorex Passport works for the Nurse personas out of the box (identity links normally require an explicit, password-confirmed link)
  for (const [email, n] of Object.entries(NURSE_PASSPORT)) {
    const u = email === "mai@demo.kiorex.test" ? await prisma.user.findFirst({ where: { email: physioEmail.get("mai")! } }) : uByEmail.get(email);
    if (!u) continue;
    await prisma.kiorexIdentityLink.upsert({ where: { userId: u.id }, create: { userId: u.id, issuer: PASSPORT_ISSUER, subject: sub(n), linkedVia: "DEMO_SEED", phoneVerified: true }, update: {} }).catch(() => undefined);
  }

  // ──────────────────────────── 5. roster profiles (agency) ────────────────────────────
  await many(prisma, "nurseRosterProfile", [
    { id: "demo_nrp_mona", tenantId: T.nsolo, userId: U.mona, skills: ["injection", "wound_dressing", "iv_cannula_infusion"], languages: ["ar", "en"], notes: "Solo practitioner (demo)" },
    { id: "demo_nrp_n1", tenantId: T.nagy, userId: U.nurse1, skills: ["wound_dressing", "post_operative_care", "elderly_care_visit", "iv_cannula_infusion"], languages: ["ar", "en"], payPerVisit: 90, payPerShiftHour: 45 },
    { id: "demo_nrp_n2", tenantId: T.nagy, userId: U.nurse2, skills: ["injection", "vitals_monitoring", "newborn_mother_care"], languages: ["ar"], payPerVisit: 80, payPerShiftHour: 40 },
    { id: "demo_nrp_n3", tenantId: T.nagy, userId: U.nurse3, skills: ["injection"], languages: ["ar"], payPerVisit: 70, notes: "Verification rejected: not dispatchable" },
    { id: "demo_nrp_n4", tenantId: T.nagy, userId: U.nurse4, skills: ["catheter_care"], languages: ["ar", "en"], payPerVisit: 85, notes: "Licence expired: not dispatchable" },
    { id: "demo_nrp_n5", tenantId: T.nagy, userId: U.nurse5, skills: ["vitals_monitoring"], languages: ["ar"], payPerVisit: 70, notes: "Not yet verified" },
  ]);

  // ──────────────────────────── 6. patients ────────────────────────────
  const phones = new Set<string>(); const patientTenant = (provider: string) => hvJson.providers[provider].tenant;
  for (const v of hvJson.visits) phones.add(`${patientTenant(v.provider)}|${v.phone}`);
  for (const c of hvJson.carePlans) phones.add(`${patientTenant(c.provider)}|${c.phone}`);
  const patientId = (tk: string, phone: string) => (tk === "na" ? `demo_p_na_${Number(phone.slice(-4)) - 1000}` : `demo_p_${tk}_h${phone.slice(-4)}`);
  const nameOf = (phone: string, v?: HvSpec): { en: [string, string]; ar: [string, string]; male: boolean; age: number } => {
    const n = Number(phone.slice(-4));
    if (n >= 1001 && n <= 1012) { const P = PERSONAS[n - 1001]; return { en: [P.first[0], P.last[0]], ar: [P.first[1], P.last[1]], male: P.male, age: [34, 38, 41, 29, 52, 31, 27, 44, 36, 33, 25, 39][n - 1001] }; }
    if (n === 1013) return { en: ["Nabila", "Hamdy"], ar: ["نبيلة", "حمدي"], male: false, age: 68 };
    const nm = v?.name ?? ["Demo", "Client", "تجريبي", "عميل"];
    return { en: [nm[0], nm[1]], ar: [nm[2], nm[3]], male: false, age: 60 };
  };
  const patRows: any[] = []; const seenPat = new Set<string>();
  for (const key of phones) {
    const [tk, phone] = key.split("|"); const id = patientId(tk, phone); if (seenPat.has(id)) continue; seenPat.add(id);
    const v = hvJson.visits.find((x) => x.phone === phone && patientTenant(x.provider) === tk);
    const nm = nameOf(phone, v);
    patRows.push({ id, tenantId: T[tk], mrn: `${tk.toUpperCase()}-H${phone.slice(-4)}`, firstNameEn: nm.en[0], lastNameEn: nm.en[1], firstNameAr: nm.ar[0], lastNameAr: nm.ar[1], gender: nm.male ? "M" : "F", dob: new Date(Date.UTC(2026 - nm.age, 4, 12)), phone, email: `h${phone.slice(-4)}.${tk}@demo.kiorex.test`, homeBranchId: clinicOf[tk], isSample: false, acquisitionChannel: v?.origin === "KIOREX" ? "KIOREX" : "DOCTOR_REFERRAL" });
  }
  // agency clients (a small book of local clients besides the Kiorex personas)
  for (const [i, nm] of [["Wafaa", "Mourad", "وفاء", "مراد", 74], ["Gamal", "Shehata", "جمال", "شحاتة", 79], ["Nadia", "Lotfy", "نادية", "لطفي", 66]].entries()) {
    patRows.push({ id: `demo_p_nagy_c${i + 1}`, tenantId: T.nagy, mrn: `NAGY-C${i + 1}`, firstNameEn: nm[0], lastNameEn: nm[1], firstNameAr: nm[2], lastNameAr: nm[3], gender: i === 1 ? "M" : "F", dob: new Date(Date.UTC(2026 - (nm[4] as number), 2, 3)), phone: `+20100000500${3 + i}`, email: `client${i + 1}.nagy@demo.kiorex.test`, homeBranchId: clinicOf.nagy, isSample: false, acquisitionChannel: "DOCTOR_REFERRAL" });
  }
  await many(prisma, "patient", patRows);
  await many(prisma, "patientAllergy", [{ id: "demo_pal_nabila", tenantId: T.nagy, patientId: patientId("nagy", "+201000001013"), code: "PENICILLIN" }, { id: "demo_pal_mahmoud", tenantId: T.nagy, patientId: patientId("nagy", "+201000001005"), code: "NSAIDS" }]);

  // ──────────────────────────── 7. home visits ────────────────────────────
  const apptRows: any[] = []; const hvRows: any[] = []; const gsRows: any[] = []; const alertRows: any[] = []; const incRows: any[] = [];
  const clinicianOf = (spec: { assigned?: string | null; provider: string }): string => {
    if (spec.assigned) return U[spec.assigned];
    return { mona: U.mona, agency: U.nurse1, mai: U.mai, nadia: U.nadia, hany: U.hany }[spec.provider]!; // appointment owner for a dispatch-queue visit = the listing clinician
  };
  const addrOf = (phone: string, key?: string) => { const a = hvJson.addresses[phone]; return key ? a?.find((x) => x.key === key) ?? a?.[0] : a?.[0]; };
  const apptIdOf = (v: { key: string; origin?: string }) => (!v.origin || v.origin === "KIOREX" ? `demo_mk_${v.key}` : `demo_hva_${v.key}`);
  type Built = { key: string; apptId: string; hvId: string; tenantKey: string; patientId: string; nurseId: string; start: Date; end: Date; spec: HvSpec };
  const built: Built[] = [];

  const addVisit = (v: HvSpec, cp?: { planKey: string; seq: number }) => {
    const tk = patientTenant(v.provider); const tenantId = T[tk]; const clinicId = clinicOf[tk];
    const type = typeOfSvc[tk][v.svc]; if (!type) throw new Error(`no type ${v.svc} in ${tk}`);
    const start = v.t.rel != null ? new Date(now.getTime() + v.t.rel * MIN) : at(v.t.off ?? 0, v.t.hour ?? 9);
    const end = new Date(start.getTime() + type.dur * MIN);
    const pid = patientId(tk, v.phone); const clinician = clinicianOf(v); const addr = addrOf(v.phone, v.addr);
    const apptId = apptIdOf(v); const hvId = `demo_hv_${v.key}`;
    const kx = v.origin === "KIOREX";
    const done = v.appt === "COMPLETED"; const ci = v.appt === "CHECKED_IN";
    const a: any = { id: apptId, tenantId, clinicId, patientId: pid, clinicianId: clinician, appointmentTypeId: type.id, startsAt: start, endsAt: end, feeAmount: type.fee, homeSurchargeAmount: type.surcharge, serviceLocation: "HOME", status: v.appt, bookingSource: kx ? "KIOREX_MARKETPLACE" : v.origin, scheduledCollectionMode: "CASH_ON_VISIT", isNewPatientAtBooking: false, notes: kx ? null : "Demo home visit booked by phone" };
    if (kx) { a.platformIntegrationClientId = ctx.mpClientId; a.externalReference = `demo_bk_${v.key}`; a.attributionJson = { source: "KIOREX_MARKETPLACE", demo: true, home: true }; }
    if (done || ci) { a.checkedInAt = v.arrivedRel != null ? new Date(now.getTime() + v.arrivedRel * MIN) : new Date(start.getTime() - 5 * MIN); a.checkInPaymentAmount = type.fee + type.surcharge; a.checkInCollectionMode = "CASH_ON_VISIT"; }
    if (v.appt === "NO_SHOW") a.noShowAt = new Date(start.getTime() + 30 * MIN);
    if (v.appt === "CANCELLED") {
      const abort = v.hv === "ABORTED_UNSAFE";
      a.cancelledAt = abort ? new Date(now.getTime() + (v.abortRel ?? 0) * MIN) : new Date(start.getTime() - DAY);
      a.cancelledBy = abort ? "SYSTEM_UNSAFE_ABORT" : v.cancelledBy ?? "PATIENT"; a.cancellationReason = abort ? "UNSAFE_ABORT" : v.cancelledBy === "CLINIC" ? "Nurse unavailable" : "Patient request"; a.depositRefundable = abort ? null : true;
    }
    apptRows.push(a);

    const ended = ["FINISHED", "ABORTED_UNSAFE", "CANCELLED", "NO_SHOW"].includes(v.hv);
    const endedAt = v.hv === "ABORTED_UNSAFE" ? new Date(now.getTime() + (v.abortRel ?? -30) * MIN) : v.hv === "FINISHED" ? end : v.hv === "CANCELLED" ? new Date(start.getTime() - DAY) : v.hv === "NO_SHOW" ? new Date(start.getTime() + 30 * MIN) : null;
    const masked = !!endedAt && endedAt.getTime() <= now.getTime() - DAY;
    const hasAddr = v.hv !== "REQUESTED" && !!addr;
    const ciphertext = hasAddr && !masked ? encryptVisitAddress({ district: addr!.district, line1: addr!.street, building: addr!.building, floor: addr!.floor, flat: addr!.flat, landmark: addr!.landmark, lat: addr!.lat, lng: addr!.lng }, tenantId) : null;
    const enRouteAt = v.enRouteRel != null ? new Date(now.getTime() + v.enRouteRel * MIN) : ["ON_MY_WAY", "ARRIVED", "FINISHED"].includes(v.hv) ? new Date(start.getTime() - 25 * MIN) : null;
    const arrivedAt = v.arrivedRel != null ? new Date(now.getTime() + v.arrivedRel * MIN) : ["ARRIVED", "FINISHED"].includes(v.hv) ? new Date(start.getTime() - 3 * MIN) : null;
    hvRows.push({
      id: hvId, tenantId, clinicId, appointmentId: apptId, patientId: pid, clinicianId: v.assigned ? U[v.assigned] : null, state: v.hv, districtId: addr?.district ?? "nasr-city", addressCiphertext: ciphertext, addressMaskedAt: masked ? new Date((endedAt as Date).getTime() + DAY) : null,
      addressConfirmedAt: hasAddr ? new Date(start.getTime() - 2 * DAY) : null, plannedStartsAt: start, plannedEndsAt: end, enRouteAt, arrivedAt, finishedAt: v.hv === "FINISHED" ? end : null, endedAt, abortReason: v.abortReason ?? null, surchargeAmount: type.surcharge,
      assignedById: v.assigned && tk === "nagy" ? U.dispatch : null, assignedAt: v.assigned && tk === "nagy" ? new Date(start.getTime() - 20 * 3_600_000) : null,
    });
    const stamp = (kind: string, when: Date) => gsRows.push({ id: `demo_gs_${v.key}_${kind}`, tenantId, visitId: hvId, kind, lat: addr?.lat != null ? Math.round(addr.lat * 100) / 100 : null, lng: addr?.lng != null ? Math.round(addr.lng * 100) / 100 : null, districtId: addr?.district ?? null, recordedAt: when });
    if (enRouteAt) stamp("ON_MY_WAY", enRouteAt);
    if (arrivedAt) stamp("ARRIVED", arrivedAt);
    if (v.hv === "FINISHED") stamp("FINISHED", end);
    if (v.hv === "ABORTED_UNSAFE") stamp("ABORTED_UNSAFE", endedAt!);
    for (const al of v.alerts ?? []) {
      const raisedAt = new Date(now.getTime() + al.raisedRel * MIN); const st = al.kiorlyStatus;
      if (al.kind === "SOS") stamp("SOS", raisedAt);
      alertRows.push({ id: al.id, tenantId, visitId: hvId, kind: al.kind === "TIMER_EXPIRED" ? "NO_ANSWER" : al.kind, raisedAt, dueAt: new Date(raisedAt.getTime() + 60_000), deliveredAt: new Date(raisedAt.getTime() + 9_000), deliveryChannel: "SMS_MOCK", latencyMs: 9_000, withinSla: true, status: st,
        acknowledgedAt: ["ACKNOWLEDGED", "RESOLVED", "ESCALATED"].includes(st) ? new Date(raisedAt.getTime() + 4 * MIN) : null, resolvedAt: st === "RESOLVED" ? new Date(raisedAt.getTime() + 25 * MIN) : null, escalatedAt: st === "ESCALATED" ? new Date(raisedAt.getTime() + 11 * MIN) : null });
    }
    if (v.hv === "ABORTED_UNSAFE") incRows.push({ id: `demo_inc_${v.key}`, tenantId, clinicId, reportedByUserId: clinician, severity: "HIGH", summaryEn: `Home visit left as unsafe (visit ${hvId})`, summaryAr: `تم ترك زيارة منزلية لأسباب تتعلق بالسلامة (الزيارة ${hvId})`, status: endedAt!.getTime() < now.getTime() - 5 * DAY ? "RESOLVED" : "OPEN", createdAt: endedAt });
    built.push({ key: v.key, apptId, hvId, tenantKey: tk, patientId: pid, nurseId: v.assigned ? U[v.assigned] : clinician, start, end, spec: v });
    void ended; void cp;
  };
  for (const v of hvJson.visits) addVisit(v);

  // care plan visits (agency client Nabila): finished before today, confirmed from today on
  const carePlanVisitRows: any[] = []; const carePlanRows: any[] = [];
  for (const c of hvJson.carePlans) {
    const tk = patientTenant(c.provider); const type = typeOfSvc[tk][c.svc]; const pid = patientId(tk, c.phone);
    let done = 0;
    for (let i = 0; i < c.count; i++) {
      const off = c.startOff + i; const past = off < 0; if (past) done++;
      const key = `${c.key}_${i + 1}`;
      addVisit({ key, provider: c.provider, phone: c.phone, addr: c.addr, svc: c.svc, t: { off, hour: c.hour }, origin: "KIOREX", appt: past ? "COMPLETED" : "CONFIRMED", hv: past ? "FINISHED" : "CONFIRMED", assigned: c.nurse, record: past }, { planKey: c.key, seq: i + 1 });
      carePlanVisitRows.push({ id: `demo_cpv_${key}`, carePlanId: `demo_cp_${c.key}`, appointmentId: apptIdOf({ key }), sequence: i + 1 });
    }
    carePlanRows.push({ id: `demo_cp_${c.key}`, tenantId: T[tk], clinicId: clinicOf[tk], patientId: pid, nurseId: U[c.nurse], title: c.title, status: "ACTIVE", startDate: at(c.startOff, 0), itemsJson: [{ appointmentTypeId: type.id, everyDays: 1, durationDays: c.count, timeOfDay: "10:00" }], visitsTotal: c.count, visitsDone: done, requestRef: c.requestRef, createdById: U.dispatch });
    void type;
  }
  await many(prisma, "appointment", apptRows);
  await many(prisma, "homeVisit", hvRows);
  await many(prisma, "homeVisitGeostamp", gsRows);
  await many(prisma, "homeSafetyAlert", alertRows);
  await many(prisma, "clinicalIncident", incRows);
  await many(prisma, "carePlan", carePlanRows);
  await many(prisma, "carePlanVisit", carePlanVisitRows);

  // ──────────────────────────── 8. nursing visit records, vitals, doctor orders, MAR ────────────────────────────
  const vrRows: any[] = []; const vitRows: any[] = []; const adminRows: any[] = [];
  const nabilaId = patientId("nagy", "+201000001013");
  const CHECK = (svc: string) => svc.includes("wound") ? ["Hand hygiene", "Remove old dressing", "Assess wound bed and edges", "Clean and re-dress", "Document wound size"] : svc === "injection" ? ["Verify order and identity", "Check allergies", "Administer injection", "Observe 15 minutes"] : ["Greet patient and family", "Measure vitals", "Assess general condition", "Explain next steps"];
  const recs = built.filter((b) => (b.tenantKey === "nsolo" || b.tenantKey === "nagy") && b.spec.hv === "FINISHED" && b.spec.appt === "COMPLETED");
  for (const [i, b] of recs.entries()) {
    const vrId = `demo_vr_${b.key}`; const t = new Date(b.end.getTime());
    vrRows.push({ id: vrId, tenantId: T[b.tenantKey], appointmentId: b.apptId, patientId: b.patientId, nurseId: b.nurseId, carePlanId: b.key.startsWith("cp1_") ? "demo_cp_cp1" : null, checklistJson: CHECK(b.spec.svc).map((task, j) => ({ task, done: true, note: j === 0 ? "Demo" : undefined })), assessment: "Patient comfortable, alert and oriented.", intervention: b.spec.svc.includes("wound") ? "Wound cleaned with saline and re-dressed; no signs of infection." : "Procedure completed as ordered.", evaluation: "Tolerated well. Family informed. Next visit as planned.", status: "SIGNED", signedAt: t, lockedAt: t, createdAt: t });
    const critical = !!b.spec.criticalVitals;
    vitRows.push({ id: `demo_vo_${b.key}_1`, tenantId: T[b.tenantKey], patientId: b.patientId, visitRecordId: vrId, recordedById: b.nurseId, recordedAt: new Date(b.start.getTime() + 5 * MIN), systolic: critical ? 168 : 118 + (i % 5) * 3, diastolic: critical ? 104 : 76 + (i % 4) * 2, pulse: critical ? 118 : 72 + (i % 7), temperatureC: critical ? 38.4 : 36.6, spo2: critical ? 88 : 97, respiratoryRate: 16 + (i % 3), flagsJson: critical ? { systolic: "CRITICAL_HIGH", pulse: "HIGH", spo2: "CRITICAL_LOW", temperatureC: "HIGH" } : {}, critical, escalationAction: critical ? "CALLED_DOCTOR" : null, escalationNote: critical ? "Doctor informed by phone (demo); family advised to call 123 if worse." : null, escalatedAt: critical ? new Date(b.start.getTime() + 9 * MIN) : null });
    if (b.patientId === nabilaId) vitRows.push({ id: `demo_vo_${b.key}_2`, tenantId: T[b.tenantKey], patientId: b.patientId, visitRecordId: vrId, recordedById: b.nurseId, recordedAt: new Date(b.start.getTime() + 20 * MIN), systolic: 142 - i * 3, diastolic: 88 - i, pulse: 80 - i, temperatureC: 36.8, spo2: 96, respiratoryRate: 18, glucoseMgDl: 132 - i * 4, painScore: Math.max(2, 6 - i), flagsJson: i < 1 ? { systolic: "HIGH" } : {}, critical: false });
  }
  // doctor orders: active (shared by consent), photo upload, controlled (+witness), expired and revoked: every MAR path is visible
  const orders = [
    { id: "demo_do_1", source: "SHARED_KIORLY", prescriber: "Dr Tamer Shawky", from: -5, to: 9, controlled: false, status: "ACTIVE", ext: "demo_mos_1", lines: [{ medicineName: "Enoxaparin 40 mg", dose: "40 mg", route: "SC", frequency: "once daily" }, { medicineName: "Paracetamol 1 g", dose: "1 g", route: "PO", frequency: "q8h PRN" }] },
    { id: "demo_do_2", source: "PHOTO_UPLOAD", prescriber: "Dr Sherif Bakr", from: -3, to: 11, controlled: false, status: "ACTIVE", ext: null, lines: [{ medicineName: "Ceftriaxone 1 g", dose: "1 g", route: "IV", frequency: "once daily" }] },
    { id: "demo_do_3", source: "PHOTO_UPLOAD", prescriber: "Dr Hossam Anwar", from: -4, to: 3, controlled: true, status: "ACTIVE", ext: null, lines: [{ medicineName: "Tramadol 50 mg (controlled, demo)", dose: "50 mg", route: "IM", frequency: "q12h PRN" }] },
    { id: "demo_do_4", source: "PHOTO_UPLOAD", prescriber: "Dr Sherif Bakr", from: -20, to: -2, controlled: false, status: "ACTIVE", ext: null, lines: [{ medicineName: "Ketorolac 30 mg", dose: "30 mg", route: "IM", frequency: "q8h" }] },
    { id: "demo_do_5", source: "SHARED_KIORLY", prescriber: "Dr Tamer Shawky", from: -6, to: 8, controlled: false, status: "REVOKED", ext: "demo_mos_2", lines: [{ medicineName: "Diclofenac 75 mg", dose: "75 mg", route: "IM", frequency: "daily" }] },
  ];
  await many(prisma, "doctorOrder", orders.map((o) => ({ id: o.id, tenantId: T.nagy, patientId: nabilaId, source: o.source, prescriberName: o.prescriber, orderedOn: at(o.from, 0), expiresOn: at(o.to, 0), controlled: o.controlled, linesJson: o.lines, externalRef: o.ext, orderVersion: o.ext ? "1" : null, status: o.status, confirmedByNurseId: U.nurse1, confirmedAt: at(o.from, 9) })));
  const cpDone = recs.filter((r) => r.key.startsWith("cp1_"));
  for (const [i, b] of cpDone.entries()) {
    adminRows.push({ id: `demo_ma_${b.key}_1`, tenantId: T.nagy, patientId: nabilaId, visitRecordId: `demo_vr_${b.key}`, doctorOrderId: "demo_do_1", medicineName: "Enoxaparin 40 mg", dose: "40 mg", route: "SC", administeredAt: new Date(b.start.getTime() + 12 * MIN), nurseId: b.nurseId, safetyCheckJson: { allergy: "PASSED", duplicate: "PASSED", orderActive: true } });
    if (i === 1) adminRows.push({ id: `demo_ma_${b.key}_2`, tenantId: T.nagy, patientId: nabilaId, visitRecordId: `demo_vr_${b.key}`, doctorOrderId: "demo_do_3", medicineName: "Tramadol 50 mg (controlled, demo)", dose: "50 mg", route: "IM", administeredAt: new Date(b.start.getTime() + 15 * MIN), nurseId: b.nurseId, witnessUserId: U.nurse2, witnessName: "Salma Nurse", safetyCheckJson: { allergy: "PASSED", duplicate: "PASSED", controlled: true, witness: "Salma Nurse" } });
  }
  await many(prisma, "visitRecord", vrRows);
  await many(prisma, "vitalsObservation", vitRows);
  await many(prisma, "medicationAdministration", adminRows);

  // private-duty shifts (Nabila): booked, completed with handover, cancelled
  await many(prisma, "shiftBooking", [
    { id: "demo_sh_1", tenantId: T.nagy, patientId: nabilaId, nurseId: U.nurse1, startsAt: at(1, 17), endsAt: at(2, 5), durationHours: 12, status: "BOOKED" },
    { id: "demo_sh_2", tenantId: T.nagy, patientId: nabilaId, nurseId: U.nurse2, startsAt: at(-2, 6), endsAt: at(-2, 14), durationHours: 8, status: "COMPLETED", checkInAt: at(-2, 6, 4), checkInLat: 29.96, checkInLng: 31.27, checkOutAt: at(-2, 14, 2), checkOutLat: 29.96, checkOutLng: 31.27, handoverNote: "Wound dry, pain 3/10, enoxaparin given 10:00. Family asked about diet (demo).", handoverToNurseId: U.nurse1 },
    { id: "demo_sh_3", tenantId: T.nagy, patientId: nabilaId, nurseId: U.nurse2, startsAt: at(3, 6), endsAt: at(3, 18), durationHours: 12, status: "CANCELLED" },
  ]);

  // ──────────────────────────── 9. physio pack (Nile Care) ────────────────────────────
  const mahmoud = patientId("na", "+201000001005"); const samir = patientId("na", "+201000001002");
  await many(prisma, "physioReferral", [{ id: "demo_pref_1", tenantId: T.na, patientId: mahmoud, source: "ATTACHED_DOCUMENT", referringDoctorName: "Dr Hossam Anwar", diagnosis: "Post-ACL reconstruction rehabilitation (demo)", createdByUserId: U.mai }, { id: "demo_pref_2", tenantId: T.na, patientId: samir, source: "ATTACHED_DOCUMENT", referringDoctorName: "Dr Hossam Anwar", diagnosis: "Mechanical low back pain (demo)", createdByUserId: U.mai }]);
  await many(prisma, "physioAssessment", [
    { id: "demo_pas_1", tenantId: T.na, patientId: mahmoud, clinicianId: U.mai, complaint: "Right knee stiffness and weakness 6 weeks after surgery", history: "ACL reconstruction (demo). No complications.", painNrs: 6, rom: [{ joint: "knee", movement: "flexion", side: "R", degrees: 85 }, { joint: "knee", movement: "extension", side: "R", degrees: -5 }], strength: [{ muscle: "quadriceps", side: "R", mrc: 3 }, { muscle: "hamstrings", side: "R", mrc: 4 }], specialTests: [{ name: "Lachman", result: "negative" }], functionalGoals: ["Walk 1 km pain-free", "Climb stairs without support"], createdAt: at(-20, 9) },
    { id: "demo_pas_2", tenantId: T.na, patientId: samir, clinicianId: U.mai, complaint: "Low back pain, desk worker", history: "Chronic mechanical LBP (demo)", painNrs: 5, rom: [{ joint: "lumbar", movement: "flexion", side: "-", degrees: 40 }], strength: [{ muscle: "core", side: "-", mrc: 4 }], specialTests: [{ name: "SLR", result: "negative" }], functionalGoals: ["Sit 2 h without pain"], createdAt: at(-40, 9) },
  ]);
  await prisma.appointmentSeries.upsert({ where: { id: "demo_ser_physio1" }, update: {}, create: { id: "demo_ser_physio1", tenantId: T.na, clinicId: clinicOf.na, patientId: mahmoud, clinicianId: U.mai, appointmentTypeId: typeOfSvc.na.physio_clinic.id, label: "Knee rehabilitation (10 sessions)", totalSessions: 10, completedSessions: 3, cadenceDays: 3, startsOn: at(-18, 0), packagePaidAmount: 3000 } });
  const phAppts: any[] = [];
  for (let i = 0; i < 6; i++) {
    const off = -18 + i * 3; const start = at(off, 10); const past = off < 0;
    phAppts.push({ id: `demo_a_na_mai_${i}`, tenantId: T.na, clinicId: clinicOf.na, patientId: mahmoud, clinicianId: U.mai, appointmentTypeId: typeOfSvc.na.physio_clinic.id, seriesId: "demo_ser_physio1", recurrenceIndex: i + 1, startsAt: start, endsAt: new Date(start.getTime() + 45 * MIN), feeAmount: 300, status: past ? "COMPLETED" : "CONFIRMED", bookingSource: "FRONT_DESK", checkedInAt: past ? start : null, checkInPaymentAmount: past ? 300 : null, checkInCollectionMode: past ? "CASH_ON_VISIT" : null });
  }
  await many(prisma, "appointment", phAppts);
  await many(prisma, "physioTreatmentPlan", [
    { id: "demo_ppl_1", tenantId: T.na, patientId: mahmoud, clinicianId: U.mai, clinicId: clinicOf.na, referralId: "demo_pref_1", assessmentId: "demo_pas_1", seriesId: "demo_ser_physio1", sessionCount: 10, sessionsCompleted: 3, frequencyPerWeek: 2, modalities: ["manual therapy", "strengthening", "TENS"], homeProgramme: [{ exercise: "Quadriceps sets", sets: 3, reps: 10 }, { exercise: "Heel slides", sets: 3, reps: 15 }, { exercise: "Straight leg raise", sets: 3, reps: 10 }], status: "ACTIVE" },
    { id: "demo_ppl_2", tenantId: T.na, patientId: samir, clinicianId: U.mai, clinicId: clinicOf.na, referralId: "demo_pref_2", assessmentId: "demo_pas_2", sessionCount: 6, sessionsCompleted: 6, frequencyPerWeek: 2, modalities: ["core stability", "mobilisation"], homeProgramme: [{ exercise: "Cat-camel", sets: 2, reps: 10 }], status: "DISCHARGED", dischargeSummary: "Goals met: pain 1/10, sits 2 h comfortably. Continue home programme (demo).", dischargedAt: at(-8, 12) },
  ]);
  await many(prisma, "physioProgressNote", [1, 2, 3].map((n) => ({ id: `demo_ppn_${n}`, tenantId: T.na, planId: "demo_ppl_1", patientId: mahmoud, clinicianId: U.mai, appointmentId: `demo_a_na_mai_${n - 1}`, sessionNo: n, subjective: ["Stiff in the morning", "Less swelling", "Walked 500 m"][n - 1], intervention: "Manual therapy, quadriceps strengthening, TENS 15 min", response: "Tolerated well", nextPlan: "Progress loading next session" })));
  const meas: any[] = [];
  [[7, 85], [6, 92], [5, 100], [4, 108]].forEach(([pain, rom], i) => {
    meas.push({ id: `demo_pom_pain_${i}`, tenantId: T.na, patientId: mahmoud, planId: "demo_ppl_1", kind: "PAIN_NRS", label: "knee_pain", side: "R", value: pain, unit: "0-10", measuredAt: at(-20 + i * 6, 10) });
    meas.push({ id: `demo_pom_rom_${i}`, tenantId: T.na, patientId: mahmoud, planId: "demo_ppl_1", kind: "ROM", label: "knee_flexion", side: "R", value: rom, unit: "deg", measuredAt: at(-20 + i * 6, 10) });
  });
  await many(prisma, "physioOutcomeMeasure", meas);
  await many(prisma, "physioHepLink", [{ id: "demo_phep_1", tenantId: T.na, planId: "demo_ppl_1", tokenHash: sha("demo-hep-token-1"), expiresAt: at(30, 0), sharedAt: at(-10, 11) }]);

  log.push(`nurse tenants (solo+agency): ${nurseUsers.length} users, ${patRows.length} patients`, `${vers.length + docVer.length + 1} verifications / ${regRows.length} registrations`, `${hvRows.length} home visits (${apptRows.length} appointments), ${alertRows.length} safety alerts, ${incRows.length} incidents`, `${carePlanRows.length} care plan, ${vrRows.length} visit records, ${vitRows.length} vitals, ${orders.length} doctor orders, ${adminRows.length} administrations`, "physio: 2 plans, 6 sessions, HEP link");
  return log.join("; ");
}

/** Removes the Nurse demo tenants (and everything under them). The three clinic demo tenants are handled by seed-demo.ts. */
export async function resetNurseDemo(prisma: PrismaClient, deleteTenant: (ids: string[]) => Promise<void>): Promise<void> {
  const rows = await prisma.tenant.findMany({ where: { name: { in: [...NURSE_DEMO_TENANT_NAMES] } }, select: { id: true } });
  await deleteTenant(rows.map((r) => r.id));
}

if (require.main === module) {
  const prisma = new PrismaClient();
  const today0 = new Date(); today0.setUTCHours(0, 0, 0, 0);
  seedRev23(prisma, { at: (off, hour, min = 0) => new Date(today0.getTime() + off * DAY + hour * 3_600_000 + min * MIN) })
    .then((s) => console.log("Kiorly Rev 2.3 demo seed OK: " + s))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
