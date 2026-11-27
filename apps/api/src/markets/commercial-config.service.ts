import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";
import {
  commercialConfigFromFeatureDefaults,
  commercialConfigPreviewDiff,
  commercialConfigToFeatureDefaultsPatch,
  mergeFeatureDefaults,
} from "./commercial-config.bridge";
import {
  type CommercialConfig,
  parseCommercialConfig,
  safeParseCommercialConfig,
} from "./commercial-config.schema";

export type CommercialConfigResponse = {
  config: CommercialConfig;
  source: "commercialConfig" | "featureDefaults";
};

export type CommercialConfigPreview = {
  changedKeys: string[];
  before: CommercialConfig;
  after: CommercialConfig;
  effectiveFeatureDefaultsPatch: Record<string, unknown>;
};

@Injectable()
export class CommercialConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPlatform(user: JwtUser) {
    if (!isPlatformSuperAdmin(user)) throw new BadRequestException("Platform super admin only");
  }

  private readStoredConfig(row: { commercialConfig: unknown; featureDefaults: unknown }): CommercialConfigResponse {
    const raw = row.commercialConfig;
    if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw as object).length > 0) {
      return { config: parseCommercialConfig(raw), source: "commercialConfig" };
    }
    return { config: commercialConfigFromFeatureDefaults(row.featureDefaults), source: "featureDefaults" };
  }

  async get(user: JwtUser, marketId: string): Promise<CommercialConfigResponse> {
    this.assertPlatform(user);
    return this.read(marketId);
  }

  /** Read-only view for the signed Kiorly admin route (the editor stays in the Clinic web). */
  async read(marketId: string): Promise<CommercialConfigResponse> {
    const row = await this.prisma.market.findFirst({ where: { id: marketId } });
    if (!row) throw new NotFoundException("Market not found");
    return this.readStoredConfig(row);
  }

  async preview(user: JwtUser, marketId: string, body: unknown): Promise<CommercialConfigPreview> {
    this.assertPlatform(user);
    const parsed = safeParseCommercialConfig(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "COMMERCIAL_CONFIG_INVALID",
        issues: parsed.error.flatten(),
      });
    }
    return this.buildPreview(marketId, parsed.data);
  }

  private async buildPreview(marketId: string, next: CommercialConfig): Promise<CommercialConfigPreview> {
    const row = await this.prisma.market.findFirst({ where: { id: marketId } });
    if (!row) throw new NotFoundException("Market not found");
    const before = this.readStoredConfig(row).config;
    const patch = commercialConfigToFeatureDefaultsPatch(next);
    return {
      before,
      after: next,
      changedKeys: commercialConfigPreviewDiff(before, next),
      effectiveFeatureDefaultsPatch: patch,
    };
  }

  async update(
    user: JwtUser,
    marketId: string,
    body: unknown,
  ): Promise<CommercialConfigResponse & { preview: CommercialConfigPreview }> {
    this.assertPlatform(user);
    const parsed = safeParseCommercialConfig(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "COMMERCIAL_CONFIG_INVALID",
        issues: parsed.error.flatten(),
      });
    }

    const row = await this.prisma.market.findFirst({ where: { id: marketId } });
    if (!row) throw new NotFoundException("Market not found");

    // SUB-01: the subscription policy moves money (auto-renew default, dunning end, proration), so it is never written here.
    // It changes only through the maker-checker flow; this endpoint preserves the stored block and rejects an edit to it.
    const storedSubscription = this.readStoredConfig(row).config.subscription;
    if (parsed.data.subscription && JSON.stringify(parsed.data.subscription) !== JSON.stringify(storedSubscription)) {
      throw new BadRequestException({
        code: "SUBSCRIPTION_POLICY_REQUIRES_APPROVAL",
        message: "Subscription policy changes need a proposal and a second platform admin's approval",
      });
    }
    if (storedSubscription) parsed.data.subscription = storedSubscription;

    const preview = await this.buildPreview(marketId, parsed.data);
    const patch = commercialConfigToFeatureDefaultsPatch(parsed.data);
    const featureDefaults = mergeFeatureDefaults(row.featureDefaults, patch);

    const auditTenant = await this.prisma.tenant.findFirst({
      where: { marketId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.market.update({
        where: { id: marketId },
        data: {
          commercialConfig: parsed.data as Prisma.InputJsonValue,
          featureDefaults: featureDefaults as Prisma.InputJsonValue,
        },
      });
      await tx.marketAuditEvent.create({
        data: {
          marketId,
          marketCode: row.code,
          action: "COMMERCIAL_CONFIG_UPDATED",
          actorId: user.userId,
          actorEmail: user.email?.trim() || null,
          actorSource: "CLINIC_PLATFORM",
          reason: "Commercial configuration updated",
          metadata: { changedKeys: preview.changedKeys } as Prisma.InputJsonValue,
        },
      });
      if (auditTenant) {
        await tx.auditLog.create({
          data: {
            tenantId: auditTenant.id,
            actorId: null,
            clinicId: null,
            action: "market.commercial_config_updated",
            resource: "Market",
            resourceId: marketId,
            metadata: {
              marketCode: row.code,
              changedKeys: preview.changedKeys,
              platformActorId: user.userId,
            } as Prisma.InputJsonValue,
          },
        });
      }
    });

    return {
      config: parsed.data,
      source: "commercialConfig",
      preview,
    };
  }
}