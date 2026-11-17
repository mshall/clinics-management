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