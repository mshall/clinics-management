import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import {
  KIOREX_CANCELLATION_POLICY_DEFAULTS,
  kiorexCancellationPolicySchema,
  safeParseCommercialConfig,
} from "../markets/commercial-config.schema";
import { PrismaService } from "../prisma/prisma.service";
import { resolveKiorexCancellationPolicy } from "./kiorex-booking-policy";
import { MarketplaceListingService } from "./marketplace-listing.service";

export type PutKiorexSettingsBody = {
  clinicId: string;
  /** Partial override; `null` resets to the market default. */
  cancellationPolicy?: Record<string, unknown> | null;
};

@Injectable()
export class KiorexSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: MarketplaceListingService,
    private readonly audit: AuditService,
  ) {}

  private async loadClinic(user: JwtUser, clinicId: string) {
    if (!clinicId) throw new BadRequestException("clinicId is required");
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId: user.tenantId ?? undefined },
      select: {
        id: true,
        tenantId: true,
        kiorexCancellationPolicy: true,
        tenant: { select: { market: { select: { commercialConfig: true } } } },
      },
    });
    if (!clinic) throw new NotFoundException("Clinic not found");
    this.listings.assertClinicManage(user, clinic.tenantId);
    return clinic;
  }

  async get(user: JwtUser, clinicId: string) {
    const clinic = await this.loadClinic(user, clinicId);
    const marketCfg = safeParseCommercialConfig(clinic.tenant.market?.commercialConfig);
    return {
      clinicId: clinic.id,
      cancellationPolicy: {
        effective: resolveKiorexCancellationPolicy(clinic.tenant.market?.commercialConfig, clinic.kiorexCancellationPolicy),
        marketDefault: (marketCfg.success && marketCfg.data.kiorex.cancellationPolicy) || KIOREX_CANCELLATION_POLICY_DEFAULTS,
        override: clinic.kiorexCancellationPolicy ?? null,
      },
    };
  }

  async put(user: JwtUser, body: PutKiorexSettingsBody) {
    const clinic = await this.loadClinic(user, body.clinicId);
    if (body.cancellationPolicy !== undefined) {
      let next: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
      if (body.cancellationPolicy !== null) {
        const parsed = kiorexCancellationPolicySchema.partial().strict().safeParse(body.cancellationPolicy);
        if (!parsed.success) {
          throw new BadRequestException({ code: "INVALID_CANCELLATION_POLICY", issues: parsed.error.issues });
        }
        next = parsed.data as Prisma.InputJsonValue;
      }
      await this.prisma.clinic.update({ where: { id: clinic.id }, data: { kiorexCancellationPolicy: next } });
      await this.audit.recordEvent({
        tenantId: clinic.tenantId,
        actorId: user.userId,
        clinicId: clinic.id,
        action: "kiorex.settings.cancellation_policy_updated",
        resource: "Clinic",
        resourceId: clinic.id,
        metadata: { before: clinic.kiorexCancellationPolicy ?? null, after: body.cancellationPolicy },
      });
    }
    return this.get(user, clinic.id);
  }
}
