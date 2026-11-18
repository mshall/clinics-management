import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { generateReferralCode, normalizeReferralCode } from "./referral-code.util";

@Injectable()
export class ReferralCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureForTenant(tenantId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const db = tx ?? this.prisma;
    const existing = await db.referralCode.findUnique({ where: { tenantId } });
    if (existing) return existing.code;
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateReferralCode(`${tenantId}-${attempt}`);
      try {
        const row = await db.referralCode.create({ data: { tenantId, code } });
        return row.code;
      } catch (e) {
        if (attempt === 7) throw e;
      }
    }
    throw new Error("could not allocate referral code");
  }

  async resolveTenantId(codeRaw: string | null | undefined): Promise<string | null> {
    const code = normalizeReferralCode(codeRaw ?? "");
    if (!code) return null;
    const row = await this.prisma.referralCode.findUnique({ where: { code } });
    return row?.tenantId ?? null;
  }
}