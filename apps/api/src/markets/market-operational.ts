import { MarketLaunchStatus, MarketOperationalStatus, type Market } from "@prisma/client";

export type MarketLike = Pick<Market, "status" | "operationalStatus" | "pausedUntil">;

/** Auto-resume when pause window elapsed. */
export function effectiveOperationalStatus(market: MarketLike, now = new Date()): MarketOperationalStatus {
  if (market.operationalStatus === MarketOperationalStatus.PAUSED && market.pausedUntil && market.pausedUntil <= now) {
    return MarketOperationalStatus.ACTIVE;
  }
  return market.operationalStatus;
}

/** Tenant onboarding: LIVE launch + operationally active (not paused/disabled). */
export function marketAcceptsNewTenants(market: MarketLike, now = new Date()): boolean {
  if (market.status !== MarketLaunchStatus.LIVE) return false;
  const op = effectiveOperationalStatus(market, now);
  return op === MarketOperationalStatus.ACTIVE;
}

export function marketOperabilityLabel(market: MarketLike, now = new Date()): "active" | "paused" | "disabled" | "draft" | "sunset" {
  if (market.status === MarketLaunchStatus.DRAFT) return "draft";
  if (market.status === MarketLaunchStatus.SUNSET) return "sunset";
  const op = effectiveOperationalStatus(market, now);
  if (op === MarketOperationalStatus.DISABLED) return "disabled";
  if (op === MarketOperationalStatus.PAUSED) return "paused";
  return "active";
}