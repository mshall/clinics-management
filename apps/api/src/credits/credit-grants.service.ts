import { Injectable, Logger, Optional } from "@nestjs/common";
import { CreditReason, Prisma } from "@prisma/client";
import { FeatureFlagsService, flagOn } from "../feature-flags/feature-flags-public";
import { creditConfigFromMarket } from "../markets/commercial-config.bridge";
import { PrismaService } from "../prisma/prisma.service";
import { CreditWalletService } from "./credit-wallet.service";

/**
 * GRW-P2-W: platform-side grants of provider credit (ADR-048): onboarding, connect bonus, dispute win. Every grant is idempotent on its own key (W-6),
 * expires (W-4), comes only from the platform or the tenant's own earned event (W-2: no method takes a second tenant) and is PROVIDER credit only (W-1).
 * Amounts come from the market's `credit` config block and default to 0 (no grant) until the founder sets them (KX-12, NEEDS_HUMAN).
 */
@Injectable()
export class CreditGrantsService {
  private readonly log = new Logger(CreditGrantsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  private async configFor(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { market: { select: { featureDefaults: true } } } });
    return creditConfigFromMarket(t?.market?.featureDefaults);
  }

  private async grantFixed(tenantId: string, reason: "ONBOARDING" | "CONNECT_BONUS", key: string, amountOf: (c: Awaited<ReturnType<CreditGrantsService["configFor"]>>) => number, note: string) {
    if (!(await flagOn(this.flags, tenantId, "clinic.provider_credit_v2"))) return null;
    const cfg = await this.configFor(tenantId);
    const amount = new Prisma.Decimal(String(amountOf(cfg)));
    if (amount.lte(0)) return null;
    return this.wallet.grantInTransaction({ tenantId, amount, reason: CreditReason[reason], idempotencyKey: key, sourceRef: key, note, metadata: { source: "platform" } });
  }

  /** One onboarding (setup / free-month) credit per organisation. */
  grantOnboarding(tenantId: string) {
    return this.grantFixed(tenantId, "ONBOARDING", `onboarding:${tenantId}`, (c) => c.onboardingAmount, "Onboarding credit");
  }

  /** One connect bonus per organisation: a replay, a second clinic or a reconnect after a pause never pays twice (unique key). */
  grantConnectBonus(tenantId: string) {
    return this.grantFixed(tenantId, "CONNECT_BONUS", `connect:${tenantId}`, (c) => c.connectBonusAmount, "Credit for connecting to Kiorex");
  }

  /** A billed fee returns as credit once, whatever replays or retries happen (key = charge id). Unbilled charges are voided elsewhere (no credit). */
  async grantDisputeWin(tenantId: string, chargeId: string, amount: Prisma.Decimal, appointmentId: string) {
    const v2 = await flagOn(this.flags, tenantId, "clinic.provider_credit_v2");
    return this.wallet.grantInTransaction({
      tenantId,
      amount,
      reason: v2 ? CreditReason.DISPUTE_WIN : CreditReason.KIOREX_LATE_REVERSAL,
      idempotencyKey: v2 ? `dispute:${chargeId}` : undefined,
      sourceRef: chargeId,
      note: `Kiorex commission returned after a dispute win · appointment ${appointmentId}`,
      metadata: { chargeId, appointmentId },
    });
  }

  /** A waived billed fee (platform waiver or goodwill) returns as credit, idempotent on the charge id. */
  async grantWaiver(tenantId: string, chargeId: string, amount: Prisma.Decimal, appointmentId: string, reasonText: string) {
    const v2 = await flagOn(this.flags, tenantId, "clinic.provider_credit_v2");
    return this.wallet.grantInTransaction({
      tenantId,
      amount,
      reason: v2 ? CreditReason.GOODWILL : CreditReason.KIOREX_LATE_REVERSAL,
      idempotencyKey: v2 ? `waiver:${chargeId}` : undefined,
      sourceRef: chargeId,
      note: `Kiorex commission waived (${reasonText}) · appointment ${appointmentId}`,
      metadata: { chargeId, appointmentId },
    });
  }
}
