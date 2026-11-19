import { BadRequestException } from "@nestjs/common";
import { MarketLaunchStatus, type Market } from "@prisma/client";
import { assertMarketMatchesProductionBinding } from "./data-cells";
import { hasCrossBorderLaunchApproval, marketRequiresCrossBorderApproval, readLegalConfig } from "./market-legal-guards";
import { validateProfessionPack } from "../scope-of-practice/profession-pack";
import { parseMarketTaxPack } from "./market-tax-pack";

const REQUIRED_MARKET_STRINGS = [
  "defaultCurrency",
  "defaultTimezone",
  "defaultPhoneRegion",
  "dataRegion",
  "hostCell",
] as const;

export function assertMarketPackConfigured(market: Market | null | undefined): asserts market is Market {
  if (!market) {
    throw new BadRequestException("Organization is not assigned to a launched market");
  }
  for (const key of REQUIRED_MARKET_STRINGS) {
    const val = market[key];
    if (typeof val !== "string" || !val.trim()) {
      throw new BadRequestException(`Market pack ${market.code} is missing required field: ${key}`);
    }
  }
  if (!Array.isArray(market.weekendDays)) {
    throw new BadRequestException(`Market pack ${market.code} is missing weekendDays`);
  }
  assertMarketMatchesProductionBinding(market);
  assertMarketProfessionPackValid(market);
}

/** PRSOP02: a market's `clinicalConfig.professionPack` override must be a valid matrix (unknown capability => reject). */
export function assertMarketProfessionPackValid(market: Pick<Market, "code" | "clinicalConfig">): void {
  const cfg = market.clinicalConfig;
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return;
  const pack = (cfg as Record<string, unknown>).professionPack;
  if (pack == null) return;
  const errors = validateProfessionPack(pack);
  if (errors.length) {
    throw new BadRequestException(`Market pack ${market.code} has an invalid professionPack: ${errors.join("; ")}`);
  }
}

/** LIVE markets must ship a complete tax pack (FD-00). */
export function assertLiveMarketHasTaxPack(market: Market): void {
  if (market.status !== MarketLaunchStatus.LIVE) return;
  if (!parseMarketTaxPack(market.taxConfig)) {
    throw new BadRequestException(
      `Market pack ${market.code} must define taxConfig (invoiceVatPercent, saasVatPercent, defaultVisitFee) before going live`,
    );
  }
}

/** Path A cross-border markets need PDPC approval ref or an active legal pilot exception (SC-01). */
export function assertLiveMarketHasCrossBorderApproval(market: Market): void {
  if (market.status !== MarketLaunchStatus.LIVE) return;
  if (!marketRequiresCrossBorderApproval(market)) return;
  const legal = readLegalConfig(market);
  if (!hasCrossBorderLaunchApproval(legal)) {
    throw new BadRequestException({
      code: "CROSS_BORDER_APPROVAL_REQUIRED",
      message: `Market ${market.code} must record crossBorderTransfer.approvalRef (or an active pilotException) in legalConfig before accepting live PHI`,
    });
  }
}

/** Same gate when transitioning DRAFT → LIVE. */
export function assertMarketReadyForCrossBorderLaunch(market: Market): void {
  if (!marketRequiresCrossBorderApproval(market)) return;
  const legal = readLegalConfig(market);
  if (!hasCrossBorderLaunchApproval(legal)) {
    throw new BadRequestException({
      code: "CROSS_BORDER_APPROVAL_REQUIRED",
      message: `Market ${market.code} needs a recorded cross-border transfer approval before launch`,
    });
  }
}