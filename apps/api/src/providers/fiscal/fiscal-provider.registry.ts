import { EtaEgyptFiscalProvider, ETA_EGYPT_PROVIDER_KEY } from "./eta-egypt.fiscal-provider";
import type { FiscalProvider, FiscalProviderKey } from "./fiscal-provider.interface";

const providers: Map<string, FiscalProvider> = new Map([[ETA_EGYPT_PROVIDER_KEY, new EtaEgyptFiscalProvider()]]);

export function getFiscalProvider(key: FiscalProviderKey): FiscalProvider | null {
  return providers.get(key) ?? null;
}

export function fiscalProviderKeyForMarket(taxConfig: Record<string, unknown> | null | undefined): string {
  const k = taxConfig?.fiscalProviderKey;
  return typeof k === "string" && k.trim() ? k.trim() : ETA_EGYPT_PROVIDER_KEY;
}

export function listFiscalProviders(): FiscalProvider[] {
  return [...providers.values()];
}