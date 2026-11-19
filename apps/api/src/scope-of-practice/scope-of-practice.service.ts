import { Injectable } from "@nestjs/common";
import { Profession, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { capabilitiesFor, resolveProfessionPack, scopeAllows, type ProfessionPack } from "./profession-pack";
import type { ScopeCapability } from "./scope-capabilities";
import { ScopeNotAllowedException } from "./scope-not-allowed.exception";

export type ScopeUserRow = { profession: Profession | null; role: UserRole; additionalRoles: UserRole[] };

/**
 * Effective profession. Explicit `User.profession` wins. During the expand phase of PRSOP01 a legacy NULL maps to
 * PHYSICIAN for physician-role users and NURSE for nurse-role users. Anyone else (admins, front desk, ...) has no
 * clinical profession: scope does not apply and the existing role / nav-tab checks remain the only gate.
 */
export function effectiveProfession(row: ScopeUserRow): Profession | null {
  if (row.profession) return row.profession;
  const roles = [row.role, ...(row.additionalRoles ?? [])];
  if (roles.includes(UserRole.PHYSICIAN)) return Profession.PHYSICIAN;
  if (roles.includes(UserRole.NURSE)) return Profession.NURSE;
  return null;
}

@Injectable()
export class ScopeOfPracticeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveContext(userId: string): Promise<{ profession: Profession | null; pack: ProfessionPack } | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        profession: true,
        role: true,
        additionalRoles: true,
        tenant: { select: { market: { select: { code: true, clinicalConfig: true } } } },
      },
    });
    if (!row) return null;
    return { profession: effectiveProfession(row), pack: resolveProfessionPack(row.tenant?.market) };
  }

  /** Throws 403 SCOPE_NOT_ALLOWED when the user's profession may not perform `capability`. */
  async assertCan(userId: string, capability: ScopeCapability): Promise<void> {
    const ctx = await this.resolveContext(userId);
    if (!ctx || ctx.profession == null) return;
    if (!scopeAllows(ctx.pack, ctx.profession, capability)) {
      throw new ScopeNotAllowedException(capability, ctx.profession);
    }
  }

  async describeForUser(userId: string) {
    const ctx = await this.resolveContext(userId);
    if (!ctx) return null;
    const v = ctx.profession ? ctx.pack.verification[ctx.profession] : null;
    return {
      profession: ctx.profession,
      professionLabelEn: v?.labelEn ?? null,
      professionLabelAr: v?.labelAr ?? null,
      capabilities: ctx.profession ? capabilitiesFor(ctx.pack, ctx.profession) : null,
      scopeVersion: ctx.pack.scopeVersion,
      cmoSigned: ctx.pack.cmoSignOff != null,
    };
  }
}
