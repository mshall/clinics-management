import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  BillingInterval,
  CreditReason,
  KiorlyInvoiceStatus,
  Prisma,
  ReferralStatus,
} from "@prisma/client";
import { FeatureFlagsService, flagOn } from "../feature-flags/feature-flags-public";
import { PrismaService } from "../prisma/prisma.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { referralConfigFromMarket } from "../markets/commercial-config.bridge";
import { referralFraudRejectReason } from "./referral-fraud";

@Injectable()
export class ReferralRewardService {
  private readonly log = new Logger(ReferralRewardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  /** Call after a Kiorly invoice becomes fully PAID. */
  async tryOnInvoiceFullyPaid(tenantId: string, invoiceId: string): Promise<void> {
    const invoice = await this.prisma.kiorlyInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, tenantId: true, status: true, total: true },
    });
    if (!invoice || invoice.tenantId !== tenantId) return;
    if (invoice.status !== KiorlyInvoiceStatus.PAID) return;
    if (invoice.total.lte(0)) return;

    const paidCount = await this.prisma.kiorlyInvoice.count({
      where: { tenantId, status: KiorlyInvoiceStatus.PAID, total: { gt: 0 } },
    });
    if (paidCount !== 1) return;

    const referral = await this.prisma.referral.findUnique({
      where: { referredTenantId: tenantId },
      include: {
        referredTenant: {
          include: {
            market: { select: { featureDefaults: true } },
            subscription: { include: { planPrice: true } },
            clinics: { select: { phone: true }, take: 1, orderBy: { createdAt: "asc" } },
          },
        },
        referrerTenant: {
          include: {
            clinics: { select: { phone: true }, take: 1, orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
    if (!referral || referral.status !== ReferralStatus.PENDING) return;
    // clinic.referral_rewards OFF (at the referrer's scope): no NEW rewards are granted; credits already in the
    // wallet are honoured elsewhere and the referral stays PENDING.
    if (!(await flagOn(this.flags, referral.referrerTenantId, "clinic.referral_rewards"))) {
      this.log.log(`referral ${referral.id}: reward skipped, clinic.referral_rewards is OFF`);
      return;
    }

    const cfg = referralConfigFromMarket(referral.referredTenant.market?.featureDefaults);
    const yearStart = new Date();
    yearStart.setUTCMonth(0, 1);
    yearStart.setUTCHours(0, 0, 0, 0);
    const rewardedThisYear = await this.prisma.referral.count({
      where: {
        referrerTenantId: referral.referrerTenantId,
        status: ReferralStatus.REWARDED,
        rewardedAt: { gte: yearStart },
      },
    });
    if (rewardedThisYear >= cfg.maxPerYear) {
      await this.reject(referral.id, "REFERRAL_CAP");
      return;
    }

    const referredPhone = referral.referredTenant.clinics[0]?.phone ?? null;
    const referrerPhone = referral.referrerTenant.clinics[0]?.phone ?? null;
    const sharedCard = await this.sharedPaymentFingerprint(
      referral.referrerTenantId,
      referral.referredTenantId,
    );

    const fraud = referralFraudRejectReason({
      referrerOwnerPhone: referrerPhone,
      referredOwnerPhone: referredPhone,
      referrerNationalId: null,
      referredNationalId: null,
      sharedPaymentFingerprint: sharedCard,
    });
    if (fraud) {
      await this.reject(referral.id, fraud);
      return;
    }

    const monthlyAmount = this.oneMonthCreditAmount(referral.referredTenant.subscription?.planPrice);
    if (monthlyAmount.lte(0)) return;

    const existingGrant = await this.prisma.creditLedgerEntry.findFirst({
      where: { sourceRef: `${referral.id}:referrer` },
    });
    if (existingGrant) return;

    const expiresAt = new Date();
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + cfg.expiryMonths);

    await this.wallet.grantInTransaction({
      tenantId: referral.referrerTenantId,
      amount: monthlyAmount,
      reason: CreditReason.REFERRAL,
      expiresAt,
      idempotencyKey: `referral:${referral.id}:referrer`,
      note: `Referral reward — colleague paid first period (${referral.code})`,
      sourceRef: `${referral.id}:referrer`,
      metadata: { referralId: referral.id, invoiceId, role: "referrer" },
    });

    await this.wallet.grantInTransaction({
      tenantId: referral.referredTenantId,
      amount: monthlyAmount,
      reason: CreditReason.REFERRAL,
      expiresAt,
      idempotencyKey: `referral:${referral.id}:referred`,
      note: `Welcome referral credit — first paid period (${referral.code})`,
      sourceRef: `${referral.id}:referred`,
      metadata: { referralId: referral.id, invoiceId, role: "referred" },
    });

    await this.prisma.referral.updateMany({
      where: { id: referral.id, status: ReferralStatus.PENDING },
      data: { status: ReferralStatus.REWARDED, rewardedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: referral.referrerTenantId,
        action: "referral.rewarded",
        resource: "Referral",
        resourceId: referral.id,
        metadata: {
          referredTenantId: referral.referredTenantId,
          amount: monthlyAmount.toFixed(2),
          invoiceId,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private oneMonthCreditAmount(
    planPrice: { amount: Prisma.Decimal; interval: BillingInterval } | null | undefined,
  ): Prisma.Decimal {
    if (!planPrice) return new Prisma.Decimal(0);
    if (planPrice.interval === BillingInterval.ANNUAL) {
      return planPrice.amount.div(12);
    }
    return planPrice.amount;
  }

  private async sharedPaymentFingerprint(referrerTenantId: string, referredTenantId: string): Promise<boolean> {
    const methods = await this.prisma.kiorlyPaymentMethod.findMany({
      where: { tenantId: { in: [referrerTenantId, referredTenantId] }, last4: { not: null } },
      select: { tenantId: true, last4: true, brand: true },
    });
    const byTenant = new Map<string, Set<string>>();
    for (const m of methods) {
      const key = `${m.brand ?? ""}:${m.last4 ?? ""}`;
      if (!byTenant.has(m.tenantId)) byTenant.set(m.tenantId, new Set());
      byTenant.get(m.tenantId)!.add(key);
    }
    const a = byTenant.get(referrerTenantId);
    const b = byTenant.get(referredTenantId);
    if (!a || !b) return false;
    for (const k of a) {
      if (b.has(k)) return true;
    }
    return false;
  }

  private async reject(referralId: string, reason: string): Promise<void> {
    await this.prisma.referral.updateMany({
      where: { id: referralId, status: ReferralStatus.PENDING },
      data: { status: ReferralStatus.REJECTED, rejectReason: reason },
    });
    this.log.warn(`Referral ${referralId} rejected: ${reason}`);
  }
}