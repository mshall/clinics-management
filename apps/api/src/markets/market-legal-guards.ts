import { BadRequestException } from "@nestjs/common";
import type { Market } from "@prisma/client";
import { marketProductionBinding } from "./data-cells";
import { parseLegalConfig, type LegalConfig } from "./legal-config.schema";
import { FEATURE_FLAG_SUB_PROCESSOR } from "./sub-processor-registry";

export function readLegalConfig(market: { legalConfig: unknown }): LegalConfig {
  const raw = market.legalConfig;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  try {
    return parseLegalConfig(raw);
  } catch {
    throw new BadRequestException({
      code: "LEGAL_CONFIG_INVALID",
      message: `Market legalConfig is not valid`,
    });
  }
}

export function marketRequiresCrossBorderApproval(market: Pick<Market, "code">): boolean {
  const binding = marketProductionBinding(market.code);
  return binding?.path === "A";
}

export function hasCrossBorderLaunchApproval(legal: LegalConfig): boolean {
  const pilot = legal.pilotException;
  if (pilot?.active && pilot.legalRef?.trim()) {
    if (pilot.expiresAt) {
      const exp = new Date(`${pilot.expiresAt}T23:59:59.999Z`);
      if (exp < new Date()) return false;
    }
    return true;
  }
  const cbt = legal.crossBorderTransfer;
  if (!cbt?.approvalRef?.trim()) return false;
  const exp = new Date(`${cbt.expiresAt}T23:59:59.999Z`);
  return exp >= new Date();
}

export function approvedSubProcessorsForMarket(market: { legalConfig: unknown }): Set<string> {
  const legal = readLegalConfig(market);
  if (legal.pilotException?.active) {
    return new Set(Object.values(FEATURE_FLAG_SUB_PROCESSOR));
  }
  const ids = legal.crossBorderTransfer?.subProcessors ?? [];
  return new Set(ids);
}

export function assertSubProcessorAllowedForFeatureFlag(
  market: Pick<Market, "code"> & { legalConfig: unknown },
  flagKey: string,
  enabling: boolean,
): void {
  if (!enabling) return;
  if (!marketRequiresCrossBorderApproval(market)) return;
  const subId = FEATURE_FLAG_SUB_PROCESSOR[flagKey];
  if (!subId) return;
  const approved = approvedSubProcessorsForMarket(market);
  if (!approved.has(subId)) {
    throw new BadRequestException({
      code: "SUB_PROCESSOR_NOT_APPROVED",
      message: `Cannot enable ${flagKey}: sub-processor ${subId} is not on the market cross-border approval list`,
      subProcessorId: subId,
    });
  }
}

export function daysUntilCrossBorderExpiry(legal: LegalConfig): number | null {
  const date = legal.crossBorderTransfer?.expiresAt ?? legal.pilotException?.expiresAt;
  if (!date) return null;
  const exp = new Date(`${date}T00:00:00.000Z`);
  return Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
}