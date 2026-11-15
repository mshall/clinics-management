import type { Prisma } from "@prisma/client";

export type ProviderSettingsMap = Record<string, Record<string, unknown>>;

export function readProviderSettings(raw: unknown): ProviderSettingsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ProviderSettingsMap = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      out[key] = { ...(val as Record<string, unknown>) };
    }
  }
  return out;
}

export function mergeProviderBlock(
  current: unknown,
  providerKey: string,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const map = readProviderSettings(current);
  map[providerKey] = { ...(map[providerKey] ?? {}), ...patch };
  return map as Prisma.InputJsonValue;
}

export type EtaEgyptClinicSettings = {
  branchCode: string | null;
  taxpayerActivityCode: string | null;
  defaultItemCode: string | null;
  receiptsEnabled: boolean;
  includeLogoOnReceipt: boolean;
};

export type EtaEgyptTenantSettings = {
  defaultTaxpayerActivityCode: string;
  defaultItemCode: string | null;
  esignatureLabel: string | null;
};

const ETA_KEY = "eta-egypt";

export function resolveEtaClinicSettings(clinic: {
  providerSettings?: unknown;
}): EtaEgyptClinicSettings {
  const block = readProviderSettings(clinic.providerSettings)[ETA_KEY] ?? {};
  const str = (k: string) => {
    const v = block[k];
    return typeof v === "string" ? v.trim() || null : null;
  };
  return {
    branchCode: str("branchCode"),
    taxpayerActivityCode: str("taxpayerActivityCode"),
    defaultItemCode: str("defaultItemCode"),
    receiptsEnabled: block.receiptsEnabled !== false,
    includeLogoOnReceipt: block.includeLogoOnReceipt !== false,
  };
}

export function resolveEtaTenantSettings(tenant: {
  providerSettings?: unknown;
}): EtaEgyptTenantSettings {
  const block = readProviderSettings(tenant.providerSettings)[ETA_KEY] ?? {};
  return {
    defaultTaxpayerActivityCode:
      typeof block.defaultTaxpayerActivityCode === "string" && block.defaultTaxpayerActivityCode.trim()
        ? block.defaultTaxpayerActivityCode.trim()
        : "8690",
    defaultItemCode:
      typeof block.defaultItemCode === "string" ? block.defaultItemCode.trim() || null : null,
    esignatureLabel:
      typeof block.esignatureLabel === "string" ? block.esignatureLabel.trim() || null : null,
  };
}

export function patchEtaClinicProviderSettings(patch: {
  branchCode?: string | null;
  taxpayerActivityCode?: string | null;
  defaultItemCode?: string | null;
  receiptsEnabled?: boolean;
  includeLogoOnReceipt?: boolean;
}): Record<string, unknown> {
  const eta: Record<string, unknown> = {};
  if (patch.branchCode !== undefined) eta.branchCode = patch.branchCode?.trim() || null;
  if (patch.taxpayerActivityCode !== undefined) eta.taxpayerActivityCode = patch.taxpayerActivityCode?.trim() || null;
  if (patch.defaultItemCode !== undefined) eta.defaultItemCode = patch.defaultItemCode?.trim() || null;
  if (patch.receiptsEnabled !== undefined) eta.receiptsEnabled = patch.receiptsEnabled;
  if (patch.includeLogoOnReceipt !== undefined) eta.includeLogoOnReceipt = patch.includeLogoOnReceipt;
  return eta;
}

export function mapEtaClinicSettingsDto(clinic: { providerSettings?: unknown }) {
  const eta = resolveEtaClinicSettings(clinic);
  return {
    etaBranchCode: eta.branchCode,
    etaTaxpayerActivityCode: eta.taxpayerActivityCode,
    etaDefaultItemCode: eta.defaultItemCode,
    etaReceiptsEnabled: eta.receiptsEnabled,
    etaIncludeLogoOnReceipt: eta.includeLogoOnReceipt,
  };
}

export function mapEtaTenantSettingsDto(tenant: { providerSettings?: unknown }) {
  const eta = resolveEtaTenantSettings(tenant);
  return {
    etaDefaultTaxpayerActivityCode: eta.defaultTaxpayerActivityCode,
    etaDefaultItemCode: eta.defaultItemCode,
    etaEsignatureLabel: eta.esignatureLabel,
  };
}

export function patchEtaTenantProviderSettings(patch: {
  defaultTaxpayerActivityCode?: string;
  defaultItemCode?: string | null;
  esignatureLabel?: string | null;
}): Record<string, unknown> {
  const eta: Record<string, unknown> = {};
  if (patch.defaultTaxpayerActivityCode !== undefined) {
    eta.defaultTaxpayerActivityCode = patch.defaultTaxpayerActivityCode.trim() || "8690";
  }
  if (patch.defaultItemCode !== undefined) eta.defaultItemCode = patch.defaultItemCode?.trim() || null;
  if (patch.esignatureLabel !== undefined) eta.esignatureLabel = patch.esignatureLabel?.trim() || null;
  return eta;
}