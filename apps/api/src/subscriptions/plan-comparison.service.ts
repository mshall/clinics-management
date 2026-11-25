import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PlanKey, type OrganizationEdition } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { ACTIVE_PRICE_WHERE } from "../plans/plans-active-prices";
import { PrismaService } from "../prisma/prisma.service";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { kiorlyBillingPackFromFeatureDefaults } from "../billing-platform/settlement-config";
import { computeDowngradeImpact, subscriptionPolicyFromFeatureDefaults, type EntitlementMap } from "./subscription-policy";

const CLINIC_ORDER: PlanKey[] = [PlanKey.LITE, PlanKey.PRO, PlanKey.CLINIC, PlanKey.ENTERPRISE];
const NURSE_ORDER: PlanKey[] = [PlanKey.NURSE_LITE, PlanKey.NURSE_PRO, PlanKey.NURSE_AGENCY];

function toMap(rows: { key: string; valueJson: unknown }[]): EntitlementMap {
  const out: EntitlementMap = {};
  for (const r of rows) {
    const v = r.valueJson;
    out[r.key] = typeof v === "boolean" || typeof v === "number" ? v : v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : Boolean(v);
  }
  return out;
}

/**
 * SUB-01 plan comparison for the Upgrade plan page (web, staff-app read-only card).
 * Every value comes from the plan catalog (Plan, PlanPrice, PlanEntitlement) and the market pack; nothing is hard-coded.
 * A plan without an active price in the market returns `price: null` and the UI shows a NEEDS_HUMAN placeholder, never a guess.
 */
@Injectable()
export class PlanComparisonService {
  constructor(private readonly prisma: PrismaService) {}

  async compare(user: JwtUser, tenantId: string) {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { marketId: true, edition: true } });
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    if (!tenant || !sub) throw new NotFoundException("Subscription not found");
    const edition: OrganizationEdition = tenant.edition;
    const order = edition === "NURSE" ? NURSE_ORDER : CLINIC_ORDER;
    const now = new Date();
    const plans = await this.prisma.plan.findMany({
      where: { key: { in: order }, OR: [{ isPublic: true }, { key: sub.plan.key }] },
      include: {
        entitlements: true,
        prices: tenant.marketId ? { where: { marketId: tenant.marketId, ...ACTIVE_PRICE_WHERE(now) }, orderBy: { priceVersion: "desc" } } : false,
      },
    });
    plans.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

    let pack: unknown = null;
    try {
      pack = (await resolveMarketForTenant(this.prisma, tenantId)).market.featureDefaults;
    } catch {
      pack = null;
    }
    const policy = subscriptionPolicyFromFeatureDefaults(pack);
    const billing = kiorlyBillingPackFromFeatureDefaults(pack);
    const currentMap = toMap(plans.find((p) => p.key === sub.plan.key)?.entitlements ?? []);
    const [clinicians, branches] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, deletedAt: null, role: "PHYSICIAN" } }),
      this.prisma.clinic.count({ where: { tenantId } }),
    ]);
    const usage = { max_clinicians: clinicians, max_branches: branches };
    const currentIdx = order.indexOf(sub.plan.key);

    return {
      currentPlanKey: sub.plan.key,
      edition,
      currency: plans.flatMap((p) => p.prices ?? [])[0]?.currency ?? null,
      /** Tax is a display line from the market pack (rate NEEDS_HUMAN); never submitted to any authority. */
      taxLine: billing.taxRatePercent != null ? { ratePercent: billing.taxRatePercent } : null,
      policy: {
        lapseAction: policy.lapseAction,
        downgradeAfterDays: policy.downgradeAfterDays,
        liteReadOnlyGraceDays: policy.liteReadOnlyGraceDays,
        autoRenewDefault: policy.autoRenewDefault,
        proration: policy.proration,
      },
      usage,
      plans: plans.map((p) => {
        const idx = order.indexOf(p.key);
        const relation = p.key === sub.plan.key ? "CURRENT" : idx > currentIdx ? "UPGRADE" : "DOWNGRADE";
        const map = toMap(p.entitlements);
        const prices = (p.prices ?? []).map((pr) => ({
          interval: pr.interval,
          unit: pr.unit,
          amount: pr.amount.toString(),
          currency: pr.currency,
          includedClinicians: pr.includedClinicians,
          extraClinicianAmount: pr.extraClinicianAmount?.toString() ?? null,
        }));
        return {
          key: p.key,
          nameEn: p.nameEn,
          nameAr: p.nameAr,
          isPublic: p.isPublic,
          relation,
          entitlements: map,
          prices,
          /** True when no active price exists for the market: the UI must show the NEEDS_HUMAN placeholder. */
          priceNeedsHuman: prices.length === 0 && order.indexOf(p.key) > 0,
          downgradeImpact:
            relation === "DOWNGRADE"
              ? computeDowngradeImpact({ fromPlanKey: sub.plan.key, toPlanKey: p.key, from: currentMap, to: map, usage, readOnlyGraceDays: policy.liteReadOnlyGraceDays })
              : null,
        };
      }),
    };
  }
}
