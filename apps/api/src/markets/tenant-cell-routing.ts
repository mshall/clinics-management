import type { Market } from "@prisma/client";
import { getDeploymentCell, loadDataCellsRegistry } from "./data-cells";

/**
 * When multiple cells are live, map market → public app URL (CloudFront AppUrl).
 * Example env: `{"EG":"https://d123.cloudfront.net","AE":"https://d456.cloudfront.net"}`
 */
export function resolvePlatformAppUrlForMarket(market: Pick<Market, "code" | "hostCell" | "dataRegion">): string | null {
  const raw = process.env.PLATFORM_CELL_APP_URLS?.trim();
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    const code = market.code.trim().toUpperCase();
    const url = map[code]?.trim();
    return url || null;
  } catch {
    return null;
  }
}

export function describeMarketCellRouting(market: Pick<Market, "code" | "hostCell" | "dataRegion">): {
  hostCell: string;
  awsRegion: string;
  stackId: string;
  appUrl: string | null;
} {
  const cellId = market.hostCell.trim();
  const cell = getDeploymentCell(cellId);
  return {
    hostCell: cellId,
    awsRegion: market.dataRegion.trim() || cell.awsRegion,
    stackId: cell.stackId,
    appUrl: resolvePlatformAppUrlForMarket(market),
  };
}

export function egyptResidencyDecisionSummary(): string {
  const reg = loadDataCellsRegistry();
  const p = reg.egyptProduction;
  return `Path ${p.path}: Egypt tenants on cell ${p.hostCell} (${p.dataRegion}); legal gate: ${p.legalGate}`;
}