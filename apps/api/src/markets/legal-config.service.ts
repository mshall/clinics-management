import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { type MarketActor, actorFromJwt } from "./market-actor";
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
    actorFromJwt(user);
    return this.read(marketId);
  }

  async read(marketId: string): Promise<LegalConfigResponse> {
    const row = await this.prisma.market.findFirst({ where: { id: marketId } });
    if (!row) throw new NotFoundException("Market not found");
    return this.buildResponse(row);
  }

  async update(user: JwtUser, marketId: string, body: unknown): Promise<LegalConfigResponse> {
    return this.updateAs(actorFromJwt(user), marketId, body);
  }

  /** `reason` (optional, at most 1000 characters) and `approvalLink` ride next to the configuration and go to the market audit trail, not into legalConfig. */
  async updateAs(actor: MarketActor, marketId: string, rawBody: unknown): Promise<LegalConfigResponse> {
    const { reason, approvalLink, ...body } = (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : {}) as Record<string, unknown>;
    const auditReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 1000) : "Legal configuration updated";
    const auditLink = typeof approvalLink === "string" && /^https:\/\//.test(approvalLink.trim()) ? approvalLink.trim().slice(0, 500) : null;
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
      await tx.marketAuditEvent.create({
        data: {
          marketId,
          marketCode: row.code,
          action: "LEGAL_CONFIG_UPDATED",
          actorId: actor.id,
          actorEmail: actor.email,
          actorSource: actor.source,
          reason: auditReason,
          approvalRef: normalized.crossBorderTransfer?.approvalRef ?? normalized.pilotException?.legalRef ?? null,
          approvalLink: auditLink,
          metadata: { crossBorder: Boolean(normalized.crossBorderTransfer), pilotException: Boolean(normalized.pilotException?.active) },
        },
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