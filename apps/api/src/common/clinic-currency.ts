import type { PrismaService } from "../prisma/prisma.service";
import { resolveMarketForTenant } from "../markets/market-resolver";

type DbClient = Pick<PrismaService, "clinic" | "tenant">;

export class MissingMarketCurrencyError extends Error {
  constructor(context: string) {
    super(`Missing currency for ${context}; configure clinic defaultCurrency or tenant baseCurrency / market pack`);
    this.name = "MissingMarketCurrencyError";
  }
}

export async function resolveClinicCurrency(
  client: DbClient,
  tenantId: string,
  clinicId: string,
): Promise<string> {
  const clinic = await client.clinic.findFirst({
    where: { id: clinicId, tenantId },
    select: { defaultCurrency: true, tenant: { select: { baseCurrency: true } } },
  });
  const fromClinic = clinic?.defaultCurrency?.trim();
  const fromTenant = clinic?.tenant.baseCurrency?.trim();
  if (fromClinic) return fromClinic;
  if (fromTenant) return fromTenant;
  const marketCtx = await resolveMarketForTenant(client as unknown as PrismaService, tenantId);
  if (marketCtx.currency?.trim()) return marketCtx.currency.trim();
  throw new MissingMarketCurrencyError(`clinic ${clinicId} / tenant ${tenantId}`);
}