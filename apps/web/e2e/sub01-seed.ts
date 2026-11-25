/**
 * SUB-01 e2e fixture: puts the demo organisation's subscription in a known state.
 *   node --import tsx e2e/sub01-seed.ts pro   -> PRO, ACTIVE, auto-renew ON, 3 seats, period ends in 20 days, saved card
 *   node --import tsx e2e/sub01-seed.ts lite  -> LITE after an auto-renew-off downgrade (previous plan PRO), 30-day read-only grace
 * Needs DATABASE_URL (the API's database). Never touches a database it was not pointed at.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const mode = process.argv[2] === "lite" ? "lite" : "pro";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const DAY = 86_400_000;

const owner = await prisma.user.findFirstOrThrow({ where: { email: "admin@drahmedshall.com" }, select: { tenantId: true } });
const tenantId = owner.tenantId!;
const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { marketId: true } });
const plan = (key: "LITE" | "PRO") => prisma.plan.findUniqueOrThrow({ where: { key } });
const price = async (planId: string) => prisma.planPrice.findFirst({ where: { planId, marketId: tenant.marketId!, interval: "MONTHLY", validTo: null }, orderBy: { priceVersion: "desc" } });
const pro = await plan("PRO");
const lite = await plan("LITE");
const proPrice = await price(pro.id);
const litePrice = await price(lite.id);
const now = new Date();
await prisma.kiorlyPaymentMethod.deleteMany({ where: { tenantId, tokenRef: "sub01-e2e" } });
const card = await prisma.kiorlyPaymentMethod.create({ data: { tenantId, provider: "paymob", kind: "CARD_TOKEN", tokenRef: "sub01-e2e", brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030, isDefault: true } });
const common = { status: "ACTIVE" as const, interval: "MONTHLY" as const, currentPeriodStart: new Date(now.getTime() - 10 * DAY), currentPeriodEnd: new Date(now.getTime() + 20 * DAY), scheduledPlanId: null, scheduledPlanPriceId: null, scheduledInterval: null, scheduledClinicianSeats: null, scheduledEffectiveAt: null, trialEndsAt: null, trialStartsAt: null, trialPlanId: null, cancelAtPeriodEnd: false, autoRenewForced: null, kiorlyDunningPausedUntil: null };
if (mode === "pro") {
  await prisma.subscription.update({ where: { tenantId }, data: { ...common, planId: pro.id, planPriceId: proPrice?.id ?? null, clinicianSeats: 3, autoRenew: true, defaultPaymentMethodId: card.id, downgradedToLiteAt: null, downgradeReason: null, liteReadOnlyGraceUntil: null, previousPlanId: null, previousPlanPriceId: null, previousInterval: null, previousClinicianSeats: null } });
} else {
  await prisma.subscription.update({ where: { tenantId }, data: { ...common, planId: lite.id, planPriceId: litePrice?.id ?? null, clinicianSeats: 2, autoRenew: true, defaultPaymentMethodId: card.id, downgradedToLiteAt: now, downgradeReason: "auto_renew_off", liteReadOnlyGraceUntil: new Date(now.getTime() + 30 * DAY), previousPlanId: pro.id, previousPlanPriceId: proPrice?.id ?? null, previousInterval: "MONTHLY", previousClinicianSeats: 3 } });
}
console.log(`sub01-seed: ${mode} for tenant ${tenantId}`);
await prisma.$disconnect();
