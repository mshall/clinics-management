import { Injectable, Optional } from "@nestjs/common";
import { ReferralStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { FeatureFlagsService, flagOn } from "../feature-flags/feature-flags-public";
import { PrismaService } from "../prisma/prisma.service";
import { ReferralCodeService } from "./referral-code.service";

@Injectable()
export class GrowthReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: ReferralCodeService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  async getReferralHub(user: JwtUser) {
    const tenantId = requireTenantId(user);
    // clinic.referral_rewards OFF: no new codes are minted (an existing code and its history stay readable).
    const rewardsOn = await flagOn(this.flags, tenantId, "clinic.referral_rewards");
    const existing = await this.prisma.referralCode.findUnique({ where: { tenantId }, select: { code: true } });
    const code = existing?.code ?? (rewardsOn ? await this.codes.ensureForTenant(tenantId) : null);
    const base = process.env.WEB_PUBLIC_ORIGIN?.trim() || "https://app.kiorly.com";
    const link = code ? `${base.replace(/\/$/, "")}/signup?ref=${encodeURIComponent(code)}` : null;

    const referrals = await this.prisma.referral.findMany({
      where: { referrerTenantId: tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        rewardedAt: true,
        rejectReason: true,
        createdAt: true,
        referredTenant: { select: { name: true } },
      },
    });

    const rewardedCount = referrals.filter((r) => r.status === ReferralStatus.REWARDED).length;

    return {
      enabled: rewardsOn,
      code,
      link,
      stats: {
        invited: referrals.length,
        rewarded: rewardedCount,
        pending: referrals.filter((r) => r.status === ReferralStatus.PENDING).length,
      },
      referrals: referrals.map((r) => ({
        id: r.id,
        status: r.status,
        clinicName: r.referredTenant.name,
        rewardedAt: r.rewardedAt?.toISOString() ?? null,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}