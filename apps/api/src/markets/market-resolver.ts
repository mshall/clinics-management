import type { Market, Tenant } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { attestTenantResidency, getDeploymentCell } from "./data-cells";
import { assertMarketPackConfigured } from "./market-pack-validation";

export type ResolvedMarketContext = {
  market: Market;
  currency: string;
  timezone: string;
  weekendDays: number[];
  taxConfig: Record<string, unknown>;
  providerConfig: Record<string, unknown>;
  paymentMethods: unknown[];
};

function jsonRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function jsonArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export async function resolveMarketForTenant(
  prisma: PrismaService,
  tenantId: string,
): Promise<ResolvedMarketContext> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { market: true },
  });
  const market = tenant?.market ?? null;
  assertMarketPackConfigured(market);

  const currency = tenant?.baseCurrency?.trim() || market.defaultCurrency.trim();
  const timezone = market.defaultTimezone.trim();
  const weekendRaw = market.weekendDays;
  const weekendDays = Array.isArray(weekendRaw)
    ? weekendRaw.map((x) => Number(x)).filter((n) => Number.isFinite(n))
    : [];
  if (!weekendDays.length) {
    throw new Error(`Market ${market.code} has invalid weekendDays`);
  }
  const taxConfig = jsonRecord(market.taxConfig);
  const providerConfig = jsonRecord(market.providerConfig);
  return {
    market,
    currency,
    timezone,
    weekendDays,
    taxConfig,
    providerConfig,
    paymentMethods: jsonArray(market.paymentMethods),
  };
}

export function deploymentCellForTenant(
  tenant: Pick<Tenant, "deploymentCell"> & { market?: Pick<Market, "hostCell"> | null },
) {
  return tenant.deploymentCell?.trim() || tenant.market?.hostCell || "frankfurt";
}

export function dataRegionForTenant(tenant: { market?: Pick<Market, "dataRegion"> | null }) {
  return tenant.market?.dataRegion?.trim() || "eu-central-1";
}

export function tenantResidencyAttestation(
  tenant: Pick<Tenant, "deploymentCell"> & { market?: Pick<Market, "code" | "hostCell" | "dataRegion"> | null },
) {
  const market = tenant.market;
  if (!market) {
    const cell = deploymentCellForTenant(tenant);
    return {
      deploymentCell: cell,
      dataRegion: getDeploymentCell(cell).awsRegion,
      dataStores: getDeploymentCell(cell).dataStores,
    };
  }
  return attestTenantResidency({ deploymentCell: tenant.deploymentCell }, market);
}