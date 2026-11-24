import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { CreditReason, Prisma } from "@prisma/client";
import { FeatureDisabledException, FeatureFlagsService } from "../../feature-flags/feature-flags-public";
import { creditConfigFromMarket } from "../../markets/commercial-config.bridge";
import { PrismaService } from "../../prisma/prisma.service";
import { CreditWalletService } from "../credit-wallet.service";
import { USAGE_BUNDLES, type UsageBundle } from "./usage-bundle.catalog";
import { readUnitBalances } from "./usage-unit-ledger";

/** Skeleton (flag `clinic.usage_bundles`, OFF by default): buy a bundle from credit; one CONSUME in the wallet, one unit grant in the separate unit ledger. */
@Injectable()
export class UsageBundleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    @Optional() private readonly flags?: FeatureFlagsService,
    /** Tests inject a priced catalogue; Nest leaves it undefined (the shipped placeholders apply). */
    @Optional() catalog?: readonly UsageBundle[],
  ) { this.catalog = catalog ?? USAGE_BUNDLES; }
  private readonly catalog: readonly UsageBundle[];

  private async gate(tenantId: string) {
    const res = this.flags ? await this.flags.evaluate(tenantId, "clinic.usage_bundles") : null;
    if (!res?.effective) throw new FeatureDisabledException("clinic.usage_bundles", res?.scope ?? "global");
    // OFF by default until bundle pricing is decided: the market config must also enable it (contracts has no default-OFF flag class, 1.12.1 request)
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { market: { select: { featureDefaults: true } } } });
    if (!creditConfigFromMarket(t?.market?.featureDefaults).usageBundlesEnabled) throw new FeatureDisabledException("clinic.usage_bundles", "market");
  }

  async list(tenantId: string) {
    await this.gate(tenantId);
    return { bundles: this.catalog, units: await readUnitBalances(this.prisma, tenantId) };
  }

  /** Buys a bundle: idempotent on the caller's key, so a retry never buys twice. */
  async purchase(tenantId: string, bundleKey: string, idempotencyKey: string, actorUserId?: string) {
    await this.gate(tenantId);
    const b = this.catalog.find((x) => x.key === bundleKey);
    if (!b) throw new NotFoundException("Unknown bundle");
    if (!idempotencyKey || idempotencyKey.length > 100) throw new BadRequestException("Idempotency-Key required");
    const key = `usage:${bundleKey}:${idempotencyKey}`;
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.usageUnitLedger.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } } });
      if (prior) return { replay: true, units: await readUnitBalances(tx, tenantId) };
      let entryId: string | null = null;
      if (b.priceCredit > 0) {
        const e = await this.wallet.consumeInTx(tx, tenantId, new Prisma.Decimal(String(b.priceCredit)), CreditReason.USAGE_PURCHASE, { use: "USAGE", idempotencyKey: key, sourceRef: `bundle:${bundleKey}`, createdBy: actorUserId, note: `Usage bundle ${b.key}` });
        entryId = e.id;
      }
      await tx.usageUnitLedger.create({ data: { tenantId, unit: b.unit, delta: b.units, reason: "BUNDLE_PURCHASE", idempotencyKey: key, purchaseEntryId: entryId } });
      return { replay: false, units: await readUnitBalances(tx, tenantId) };
    });
  }
}
