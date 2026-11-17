import { BadRequestException } from "@nestjs/common";
import { MarketLaunchStatus, type Market } from "@prisma/client";
import { assertMarketMatchesProductionBinding } from "./data-cells";
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