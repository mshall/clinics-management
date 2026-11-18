import { Injectable } from "@nestjs/common";
import { ReferralStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { PrismaService } from "../prisma/prisma.service";
import { ReferralCodeService } from "./referral-code.service";

@Injectable()
export class GrowthReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: ReferralCodeService,
  ) {}

  async getReferralHub(user: JwtUser) {
    const tenantId = requireTenantId(user);
    const code = await this.codes.ensureForTenant(tenantId);
    const base = process.env.WEB_PUBLIC_ORIGIN?.trim() || "https://app.kiorly.com";
    const link = `${base.replace(/\/$/, "")}/signup?ref=${encodeURIComponent(code)}`;

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