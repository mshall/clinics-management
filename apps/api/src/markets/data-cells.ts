import { BadRequestException } from "@nestjs/common";
import type { Market, Tenant } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type DataResidencyPath = "A" | "B";

export type CellDataStore = {
  service: string;
  region: string;
};

export type DeploymentCellSpec = {
  awsRegion: string;
  runtimeTimezone: string;
  stackId: string;
  status?: string;
  dataStores: Record<string, CellDataStore>;
};

export type MarketProductionBinding = {
  hostCell: string;
  dataRegion: string;
  path: DataResidencyPath;
};

export type DataCellsRegistry = {
  version: number;
  decisionId: string;
  egyptProduction: {
    path: DataResidencyPath;
    hostCell: string;
    dataRegion: string;
    legalGate: string;
  };
  cells: Record<string, DeploymentCellSpec>;
  marketProductionBinding: Record<string, MarketProductionBinding>;
};

function repoRootFromApiSrc(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "platform", "data-cells.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(__dirname, "..", "..", "..", "..", "..");
}

let cached: DataCellsRegistry | null = null;

/** Canonical cell registry (SC-01). Source file: `platform/data-cells.json` at repo root. */
export function loadDataCellsRegistry(): DataCellsRegistry {
  if (cached) return cached;
  const path = join(repoRootFromApiSrc(), "platform", "data-cells.json");
  if (!existsSync(path)) {
    throw new Error(
      `Missing platform/data-cells.json at ${path}. The API image must COPY platform/data-cells.json (see apps/api/Dockerfile).`,
    );
  }
  cached = JSON.parse(readFileSync(path, "utf8")) as DataCellsRegistry;
  return cached;
}

export function getDeploymentCell(cellId: string): DeploymentCellSpec {
  const reg = loadDataCellsRegistry();
  const cell = reg.cells[cellId];
  if (!cell) {
    throw new Error(`Unknown deployment cell: ${cellId}`);
  }
  return cell;
}

export function marketProductionBinding(marketCode: string): MarketProductionBinding | null {
  const reg = loadDataCellsRegistry();
  return reg.marketProductionBinding[marketCode.trim().toUpperCase()] ?? null;
}

/** Infra + legal attestation for a tenant (DB, uploads, RDS backups). */
export type TenantResidencyAttestation = {
  marketCode: string;
  deploymentCell: string;
  dataRegion: string;
  path: DataResidencyPath;
  dataStores: Record<string, CellDataStore>;
};

export function attestTenantResidency(
  tenant: Pick<Tenant, "deploymentCell">,
  market: Pick<Market, "code" | "hostCell" | "dataRegion">,
): TenantResidencyAttestation {
  const deploymentCell = tenant.deploymentCell?.trim() || market.hostCell.trim();
  const binding = marketProductionBinding(market.code);
  const path: DataResidencyPath = binding?.path ?? "A";
  const cell = getDeploymentCell(deploymentCell);
  const dataRegion = market.dataRegion.trim() || cell.awsRegion;
  return {
    marketCode: market.code,
    deploymentCell,
    dataRegion,
    path,
    dataStores: { ...cell.dataStores },
  };
}

/** LIVE markets with a production binding must match registry hostCell + dataRegion (SC-01). */
export function assertMarketMatchesProductionBinding(market: Pick<Market, "code" | "hostCell" | "dataRegion">): void {
  const binding = marketProductionBinding(market.code);
  if (!binding) return;
  const hostCell = market.hostCell.trim();
  const dataRegion = market.dataRegion.trim();
  if (hostCell !== binding.hostCell || dataRegion !== binding.dataRegion) {
    throw new BadRequestException(
      `Market ${market.code} must use hostCell=${binding.hostCell} and dataRegion=${binding.dataRegion} per data residency decision ${loadDataCellsRegistry().decisionId}`,
    );
  }
}

export function assertTenantDeploymentCellMatchesMarket(
  tenant: Pick<Tenant, "deploymentCell">,
  market: Pick<Market, "code" | "hostCell" | "dataRegion">,
): void {
  const binding = marketProductionBinding(market.code);
  if (!binding) return;
  const effectiveCell = tenant.deploymentCell?.trim() || market.hostCell.trim();
  if (effectiveCell !== binding.hostCell) {
    throw new BadRequestException(
      `Tenant in market ${market.code} must use deployment cell ${binding.hostCell} (got ${effectiveCell})`,
    );
  }
  const attestation = attestTenantResidency(tenant, market);
  for (const store of Object.values(attestation.dataStores)) {
    if (store.region !== binding.dataRegion) {
      throw new BadRequestException(
        `Cell ${effectiveCell} store ${store.service} must reside in ${binding.dataRegion}`,
      );
    }
  }
}