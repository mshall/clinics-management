import { Injectable, Optional } from "@nestjs/common";
import { FeatureFlagsService, flagOn } from "../feature-flags/feature-flags-public";
import type { Prisma } from "@prisma/client";
import { ReferralStatus } from "@prisma/client";
import { normalizeReferralCode } from "./referral-code.util";
import { ReferralCodeService } from "./referral-code.service";

@Injectable()
export class ReferralAttributionService {
  constructor(
    private readonly codes: ReferralCodeService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  /** Attach ?ref= at signup; does not reward until first paid period. */
  async attachAtSignup(
    tx: Prisma.TransactionClient,
    referredTenantId: string,
    subscriptionId: string,
    refRaw: string | null | undefined,
  ): Promise<void> {
    const code = normalizeReferralCode(refRaw ?? "");
    if (!code) return;
    // clinic.referral_rewards OFF: no new referral attributions; earned credits are honoured elsewhere.
    if (!(await flagOn(this.flags, null, "clinic.referral_rewards"))) return;
    const refRow = await tx.referralCode.findUnique({ where: { code } });
    const referrerTenantId = refRow?.tenantId;
    if (!referrerTenantId || referrerTenantId === referredTenantId) return;

    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { referralCodeUsed: code },
    });
    await tx.referral.upsert({
      where: { referredTenantId },
      create: {
        code,
        referrerTenantId,
        referredTenantId,
        status: ReferralStatus.PENDING,
      },
      update: {},
    });
  }
}