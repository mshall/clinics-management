import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";
import {
  daysUntilCrossBorderExpiry,
  hasCrossBorderLaunchApproval,
  marketRequiresCrossBorderApproval,
  readLegalConfig,
} from "./market-legal-guards";
import { type LegalConfig, parseLegalConfig, safeParseLegalConfig } from "./legal-config.schema";

export type LegalConfigResponse = {
  config: LegalConfig;
  crossBorderRequired: boolean;
  launchApproved: boolean;
  daysUntilExpiry: number | null;
};

@Injectable()
export class LegalConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPlatform(user: JwtUser) {
    if (!isPlatformSuperAdmin(user)) throw new BadRequestException("Platform super admin only");
  }

  private buildResponse(market: { code: string; legalConfig: unknown }): LegalConfigResponse {
    const config = readLegalConfig(market);
    const crossBorderRequired = marketRequiresCrossBorderApproval(market);
    return {
      config,
      crossBorderRequired,
      launchApproved: crossBorderRequired ? hasCrossBorderLaunchApproval(config) : true,
      daysUntilExpiry: daysUntilCrossBorderExpiry(config),
    };
  }

  async get(user: JwtUser, marketId: string): Promise<LegalConfigResponse> {
    this.assertPlatform(user);
    const row = await this.prisma.market.findFirst({ where: { id: marketId } });
    if (!row) throw new NotFoundException("Market not found");
    return this.buildResponse(row);
  }

  async update(user: JwtUser, marketId: string, body: unknown): Promise<LegalConfigResponse> {
    this.assertPlatform(user);
    const parsed = safeParseLegalConfig(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "LEGAL_CONFIG_INVALID",
        issues: parsed.error.flatten(),
      });
    }
    const normalized = parseLegalConfig(parsed.data);

    const row = await this.prisma.market.findFirst({ where: { id: marketId } });
    if (!row) throw new NotFoundException("Market not found");

    const auditTenant = await this.prisma.tenant.findFirst({
      where: { marketId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.market.update({
        where: { id: marketId },
        data: { legalConfig: normalized as Prisma.InputJsonValue },
      });
      if (auditTenant) {
        await tx.auditLog.create({
          data: {
            tenantId: auditTenant.id,
            actorId: null,
            clinicId: null,
            action: "market.legal_config_updated",
            resource: "Market",
            resourceId: marketId,
            metadata: { approvalRef: normalized.crossBorderTransfer?.approvalRef ?? null },
          },
        });
      }
    });

    const updated = await this.prisma.market.findFirstOrThrow({ where: { id: marketId } });
    return this.buildResponse(updated);
  }
}