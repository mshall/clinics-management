import { BillingInterval, PlanKey, PrismaClient, SubscriptionStatus, UserRole, type Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { NURSE_SERVICE_CATALOGUE } from "../src/nurse/nurse-services";

/**
 * KNED seeded demo tenants (KX-23): one SOLO nurse practice and one AGENCY with a dispatcher, two nurses and an aide. Minimal and IDEMPOTENT by
 * design: keyed by e-mail/name, never deletes, never touches other tenants. A data-seeding agent may extend it later (patients, history).
 * Local demo only (password "demo", synthetic .test addresses); profession verification is left PENDING so the dispatch guard is visible.
 * Run: `npm run db:seed:nurse -w api` (needs the EG market + plan catalogue from `db:setup`).
 */
export type NurseDemoResult = { solo: { tenantId: string; nurseEmail: string }; agency: { tenantId: string; dispatcherEmail: string; nurseEmails: string[] } };

const DEMO_PASSWORD = "demo";

async function ensureUser(prisma: PrismaClient, tenantId: string, email: string, displayName: string, role: UserRole, extra: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({ data: { tenantId, email, displayName, role, passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10), ...extra } });
}

async function ensureTenant(prisma: PrismaClient, name: string, nameAr: string, kind: "SOLO" | "AGENCY", plan: PlanKey) {
  const eg = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
  let tenant = await prisma.tenant.findFirst({ where: { name } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name, nameAr, marketId: eg.id, deploymentCell: "frankfurt", edition: "NURSE", nurseTenantKind: kind, defaultVisitFee: 200, safetyContactName: "Demo safety contact", safetyContactPhone: "+201000000777" } });
  }
  const clinic = (await prisma.clinic.findFirst({ where: { tenantId: tenant.id } })) ?? (await prisma.clinic.create({ data: { tenantId: tenant.id, nameEn: name, nameAr, country: "EG", city: "Cairo", addressEn: "Cairo", addressAr: "القاهرة", locationUrl: "https://maps.example/demo", phone: "+201000000700", email: `${kind.toLowerCase()}.clinic@nurse-demo.kiorly.test`, licenseNumber: "DEMO", defaultCurrency: "EGP", timezone: "Africa/Cairo" } }));
  const planRow = await prisma.plan.findUniqueOrThrow({ where: { key: plan } });
  if (!(await prisma.subscription.findUnique({ where: { tenantId: tenant.id } }))) {
    await prisma.subscription.create({ data: { tenantId: tenant.id, planId: planRow.id, status: SubscriptionStatus.ACTIVE, interval: BillingInterval.MONTHLY, clinicianSeats: kind === "AGENCY" ? 10 : 1, activatedAt: new Date(), currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) } });
  }
  if ((await prisma.appointmentType.count({ where: { tenantId: tenant.id } })) === 0) {
    for (const s of NURSE_SERVICE_CATALOGUE) {
      await prisma.appointmentType.create({ data: { tenantId: tenant.id, clinicId: clinic.id, nameEn: s.nameEn, nameAr: s.nameAr, durationMinutes: s.durationMinutes, feeAmount: Math.round(200 * s.feeFactor), serviceLocation: "HOME", bufferBeforeMin: 30, bufferAfterMin: 30 } });
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
