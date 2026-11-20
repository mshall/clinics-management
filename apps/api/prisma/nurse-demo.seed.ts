import { BillingInterval, PlanKey, PrismaClient, SubscriptionStatus, UserRole, type Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { NURSE_SERVICE_CATALOGUE } from "../src/nurse/nurse-services";

/**
 * KNED seeded demo tenants (KX-23): one SOLO nurse practice and one AGENCY with a dispatcher, two nurses and an aide. Minimal and IDEMPOTENT by
 * design: keyed by e-mail/name, never deletes, never touches other tenants. A data-seeding agent may extend it later (patients, history).
 * Local demo only (password Demo@12345, synthetic .test addresses). Verification states, home settings, visits, care plans, MAR etc. are added by prisma/demo/seed-rev23.ts (called from db:seed:demo).
 * Run: `npm run db:seed:nurse -w api` (needs the EG market + plan catalogue from `db:setup`).
 */
export type NurseDemoResult = { solo: { tenantId: string; nurseEmail: string }; agency: { tenantId: string; dispatcherEmail: string; nurseEmails: string[] } };

/** Same staff password as the other demo tenants (workspace TEST_DATA.md). Existing demo users are re-hashed by the Rev 2.3 demo seed. */
export const NURSE_DEMO_PASSWORD = "Demo@12345";
const DEMO_PASSWORD = NURSE_DEMO_PASSWORD;
/** Deterministic ids for NEW rows (so seeds and Kiorex mirrors can reference them); tenants created by older runs keep their cuids until `--reset`. */
export const NURSE_DEMO_TENANT_NAMES = ["Demo Home Nursing (Mona)", "Demo Care Agency"] as const;
const TENANT_KEY: Record<"SOLO" | "AGENCY", string> = { SOLO: "nsolo", AGENCY: "nagy" };

async function ensureUser(prisma: PrismaClient, tenantId: string, email: string, displayName: string, role: UserRole, extra: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) return existing;
  const [local] = email.split("@");
  const kind = tenantId === "demo_t_nsolo" ? "nsolo" : tenantId === "demo_t_nagy" ? "nagy" : null;
  return prisma.user.create({ data: { ...(kind ? { id: `demo_u_${kind}_${local}` } : {}), tenantId, email, displayName, role, passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10), ...extra } });
}

async function ensureTenant(prisma: PrismaClient, name: string, nameAr: string, kind: "SOLO" | "AGENCY", plan: PlanKey) {
  const eg = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
  let tenant = await prisma.tenant.findFirst({ where: { name } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { id: `demo_t_${TENANT_KEY[kind]}`, name, nameAr, marketId: eg.id, deploymentCell: "frankfurt", edition: "NURSE", nurseTenantKind: kind, defaultVisitFee: 200, safetyContactName: "Demo safety contact", safetyContactPhone: "+201000000777" } });
  }
  const clinic = (await prisma.clinic.findFirst({ where: { tenantId: tenant.id } })) ?? (await prisma.clinic.create({ data: { id: `demo_c_${TENANT_KEY[kind]}`, tenantId: tenant.id, nameEn: name, nameAr, country: "EG", city: "Cairo", addressEn: "Cairo", addressAr: "القاهرة", locationUrl: "https://maps.example/demo", phone: "+201000000700", email: `${kind.toLowerCase()}.clinic@nurse-demo.kiorly.test`, licenseNumber: "DEMO", defaultCurrency: "EGP", timezone: "Africa/Cairo" } }));
  const planRow = await prisma.plan.findUniqueOrThrow({ where: { key: plan } });
  if (!(await prisma.subscription.findUnique({ where: { tenantId: tenant.id } }))) {
    await prisma.subscription.create({ data: { tenantId: tenant.id, planId: planRow.id, status: SubscriptionStatus.ACTIVE, interval: BillingInterval.MONTHLY, clinicianSeats: kind === "AGENCY" ? 10 : 1, activatedAt: new Date(), currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) } });
  }
  if ((await prisma.appointmentType.count({ where: { tenantId: tenant.id } })) === 0) {
    for (const s of NURSE_SERVICE_CATALOGUE) {
      await prisma.appointmentType.create({ data: { id: `demo_ty_${TENANT_KEY[kind]}_${s.code}`, tenantId: tenant.id, clinicId: clinic.id, nameEn: s.nameEn, nameAr: s.nameAr, durationMinutes: s.durationMinutes, feeAmount: Math.round(200 * s.feeFactor), serviceLocation: "HOME", bufferBeforeMin: 30, bufferAfterMin: 30 } });
    }
  }
  return { tenant, clinic };
}

export async function ensureNurseDemoTenants(prisma: PrismaClient): Promise<NurseDemoResult> {
  const solo = await ensureTenant(prisma, "Demo Home Nursing (Mona)", "تمريض منزلي تجريبي (منى)", "SOLO", PlanKey.NURSE_PRO);
  const mona = await ensureUser(prisma, solo.tenant.id, "mona@nurse-demo.kiorly.test", "Mona Adel", UserRole.PHYSICIAN, { profession: "NURSE", isTenantOwner: true, additionalRoles: [UserRole.GROUP_ADMIN] });
  const agency = await ensureTenant(prisma, "Demo Care Agency", "شركة رعاية تجريبية", "AGENCY", PlanKey.NURSE_AGENCY);
  await ensureUser(prisma, agency.tenant.id, "owner@nurse-demo.kiorly.test", "Agency Owner", UserRole.CLINIC_ADMIN, { isTenantOwner: true, additionalRoles: [UserRole.GROUP_ADMIN] });
  const dispatcher = await ensureUser(prisma, agency.tenant.id, "dispatch@nurse-demo.kiorly.test", "Dina Dispatcher", UserRole.RECEPTIONIST);
  const n1 = await ensureUser(prisma, agency.tenant.id, "nurse1@nurse-demo.kiorly.test", "Heba Nurse", UserRole.PHYSICIAN, { profession: "NURSE" });
  const n2 = await ensureUser(prisma, agency.tenant.id, "nurse2@nurse-demo.kiorly.test", "Salma Nurse", UserRole.PHYSICIAN, { profession: "NURSE" });
  // Rev 2.3 data seed: five nurses so every profession-verification state is visible on the roster (nurse3 rejected, nurse4 licence expired, nurse5 not submitted).
  await ensureUser(prisma, agency.tenant.id, "nurse3@nurse-demo.kiorly.test", "Nadine Nurse", UserRole.PHYSICIAN, { profession: "NURSE" });
  await ensureUser(prisma, agency.tenant.id, "nurse4@nurse-demo.kiorly.test", "Rawan Nurse", UserRole.PHYSICIAN, { profession: "NURSE" });
  await ensureUser(prisma, agency.tenant.id, "nurse5@nurse-demo.kiorly.test", "Yara Nurse", UserRole.PHYSICIAN, { profession: "NURSE" });
  await ensureUser(prisma, agency.tenant.id, "aide@nurse-demo.kiorly.test", "Aya Aide", UserRole.PHYSICIAN, { profession: "ASSISTANT", supervisorUserId: n1.id });
  for (const u of [mona, n1, n2]) {
    await prisma.clinicianHomeSettings.upsert({ where: { tenantId_clinicianId: { tenantId: u.tenantId!, clinicianId: u.id } }, create: { tenantId: u.tenantId!, clinicianId: u.id, acceptsHomeVisits: true, coverageDistrictIds: ["nasr-city", "heliopolis"] }, update: {} });
  }
  return { solo: { tenantId: solo.tenant.id, nurseEmail: mona.email }, agency: { tenantId: agency.tenant.id, dispatcherEmail: dispatcher.email, nurseEmails: [n1.email, n2.email] } };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  ensureNurseDemoTenants(prisma)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .finally(() => prisma.$disconnect());
}
