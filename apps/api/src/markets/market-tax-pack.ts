import { BadRequestException } from "@nestjs/common";
import type { Market } from "@prisma/client";

export type MarketTaxPack = {
  invoiceVatPercent: number;
  saasVatPercent: number;
  defaultVisitFee: number;
  trnFormat: string | null;
  trnRequired: boolean;
};

const TAX_PACK_KEYS = [
  "invoiceVatPercent",
  "saasVatPercent",
  "defaultVisitFee",
  "trnFormat",
  "trnRequired",
] as const;

function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function readBool(obj: Record<string, unknown>, key: string): boolean | undefined {
  const v = obj[key];
  if (typeof v === "boolean") return v;
  return undefined;
}

function readString(obj: Record<string, unknown>, key: string): string | null | undefined {
  const v = obj[key];
  if (typeof v === "string") return v.trim() ? v.trim() : null;
  return undefined;
}

/** Parse `Market.taxConfig` tax/fee keys (supports legacy `defaultVatPercent` as invoice VAT). */
export function parseMarketTaxPack(taxConfig: unknown): MarketTaxPack | null {
  if (!taxConfig || typeof taxConfig !== "object" || Array.isArray(taxConfig)) return null;
  const m = taxConfig as Record<string, unknown>;
  const invoiceVatPercent =
    readNumber(m, "invoiceVatPercent") ?? readNumber(m, "defaultVatPercent");
  const saasVatPercent = readNumber(m, "saasVatPercent");
  const defaultVisitFee = readNumber(m, "defaultVisitFee");
  if (
    invoiceVatPercent === undefined ||
    saasVatPercent === undefined ||
    defaultVisitFee === undefined
  ) {
    return null;
  }
  const trnRequired = readBool(m, "trnRequired") ?? false;
  const trnFormat = readString(m, "trnFormat") ?? null;
  return {
    invoiceVatPercent,
    saasVatPercent,
    defaultVisitFee,
    trnFormat,
    trnRequired,
  };
}

export function requireMarketTaxPack(market: Pick<Market, "taxConfig"> & { code?: string }): MarketTaxPack {
  const pack = parseMarketTaxPack(market.taxConfig);
  if (!pack) {
    const label = market.code?.trim() || "market";
    throw new BadRequestException(`Market pack ${label} is missing taxConfig (${TAX_PACK_KEYS.join(", ")})`);
  }
  return pack;
}

export type TrnValidationResult =
  | { ok: true }
  | { ok: false; messageEn: string; messageAr: string };

export function validateTrnForMarketPack(trn: string | null | undefined, pack: MarketTaxPack): TrnValidationResult {
  const trimmed = trn?.trim() ?? "";
  if (!trimmed) {
    if (pack.trnRequired) {
      return {
        ok: false,
        messageEn: "Tax registration number (TRN) is required for this market.",
        messageAr: "الرقم الضريبي (TRN) مطلوب في هذا السوق.",
      };
    }
    return { ok: true };
  }
  if (pack.trnFormat) {
    let re: RegExp;
    try {
      re = new RegExp(pack.trnFormat);
    } catch {
      return {
        ok: false,
        messageEn: "Market TRN format is misconfigured.",
        messageAr: "تنسيق الرقم الضريبي في حزمة السوق غير صالح.",
      };
    }
    if (!re.test(trimmed)) {
      return {
        ok: false,
        messageEn: "Tax registration number (TRN) does not match the format required for your market.",
        messageAr: "الرقم الضريبي (TRN) لا يطابق التنسيق المطلوب في سوقكم.",
      };
    }
  }
  return { ok: true };
}

export function trnValidationException(result: Extract<TrnValidationResult, { ok: false }>): BadRequestException {
  return new BadRequestException({
    message: result.messageEn,
    messageAr: result.messageAr,
  });
}

export function assertTrnForMarket(trn: string | null | undefined, pack: MarketTaxPack): void {
  const result = validateTrnForMarketPack(trn, pack);
  if (!result.ok) throw trnValidationException(result);
}

function readStoredDecimal(
  value: { toNumber?: () => number } | number | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "object" && typeof value.toNumber === "function") return value.toNumber();
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type TenantTaxStored = {
  deploymentCell?: string | null;
  defaultVisitFee?: { toNumber?: () => number } | number | null;
  defaultInvoiceVatPercent?: { toNumber?: () => number } | number | null;
  defaultTaxRegistrationNumber?: string | null;
};

export function effectiveClinicInvoiceVatPercent(
  clinic: { invoiceVatPercent?: { toNumber?: () => number } | number | null },
  market: Pick<Market, "hostCell" | "taxConfig">,
  tenant: TenantTaxStored,
): number {
  const stored = readStoredDecimal(clinic.invoiceVatPercent);
  if (stored != null) return stored;
  return tenantTaxEffectiveFromMarket(market, tenant).defaultInvoiceVatPercent;
}

export type TenantTaxEffective = {
  defaultVisitFee: number;
  defaultInvoiceVatPercent: number;
  defaultTaxRegistrationNumber: string | null;
  deploymentCell: string;
};

export function tenantTaxEffectiveFromMarket(
  market: Pick<Market, "hostCell" | "taxConfig"> & { code?: string },
  tenant: TenantTaxStored,
): TenantTaxEffective {
  const pack = requireMarketTaxPack(market);
  const visitStored = readStoredDecimal(tenant.defaultVisitFee);
  const vatStored = readStoredDecimal(tenant.defaultInvoiceVatPercent);
  return {
    defaultVisitFee: visitStored ?? pack.defaultVisitFee,
    defaultInvoiceVatPercent: vatStored ?? pack.invoiceVatPercent,
    defaultTaxRegistrationNumber: tenant.defaultTaxRegistrationNumber?.trim() || null,
    deploymentCell: tenant.deploymentCell?.trim() || market.hostCell,
  };
}

/** Values applied when provisioning a new tenant from a live market pack (never from DB column defaults). */
export function tenantCreateDefaultsFromMarket(
  market: Pick<Market, "id" | "hostCell" | "taxConfig" | "code">,
): {
  marketId: string;
  deploymentCell: string;
  defaultVisitFee: number;
  defaultInvoiceVatPercent: number;
  defaultTaxRegistrationNumber: string | null;
} {
  const pack = requireMarketTaxPack(market);
  return {
    marketId: market.id,
    deploymentCell: market.hostCell.trim(),
    defaultVisitFee: pack.defaultVisitFee,
    defaultInvoiceVatPercent: pack.invoiceVatPercent,
    defaultTaxRegistrationNumber: null,
  };
}

export function clinicInvoiceDefaultsFromTenant(
  market: Pick<Market, "hostCell" | "taxConfig" | "code">,
  tenant: TenantTaxStored,
): { invoiceVatPercent: number; taxRegistrationNumber: string | null } {
  const effective = tenantTaxEffectiveFromMarket(market, tenant);
  return {
    invoiceVatPercent: effective.defaultInvoiceVatPercent,
    taxRegistrationNumber: effective.defaultTaxRegistrationNumber,
  };
}

export type TenantTaxSettingsApi = {
  defaultVisitFee: number;
  defaultVisitFeeOverride: number | null;
  defaultVisitFeeUsesMarketDefault: boolean;
  defaultInvoiceVatPercent: number;
  defaultInvoiceVatPercentOverride: number | null;
  defaultInvoiceVatPercentUsesMarketDefault: boolean;
  defaultTaxRegistrationNumber: string | null;
  defaultTaxRegistrationNumberOverride: string | null;
  defaultTaxRegistrationNumberUsesMarketDefault: boolean;
  marketTaxDefaults: {
    defaultVisitFee: number;
    invoiceVatPercent: number;
    saasVatPercent: number;
  } | null;
};

export function effectiveTenantVisitFee(tenant: TenantTaxStored, market: Pick<Market, "hostCell" | "taxConfig" | "code"> | null): number {
  if (!market) return Number(tenant.defaultVisitFee ?? 0);
  return tenantTaxEffectiveFromMarket(market, tenant).defaultVisitFee;
}

export function mapTenantTaxSettingsApi(
  tenant: TenantTaxStored & { market: Market | null; defaultVisitFee?: { toNumber?: () => number } | number | null; defaultInvoiceVatPercent?: { toNumber?: () => number } | number | null },
): TenantTaxSettingsApi {
  if (!tenant.market) {
    const visitOverride = readStoredDecimal(tenant.defaultVisitFee);
    const vatOverride = readStoredDecimal(tenant.defaultInvoiceVatPercent);
    return {
      defaultVisitFee: visitOverride ?? 0,
      defaultVisitFeeOverride: visitOverride,
      defaultVisitFeeUsesMarketDefault: tenant.defaultVisitFee == null,
      defaultInvoiceVatPercent: vatOverride ?? 0,
      defaultInvoiceVatPercentOverride: vatOverride,
      defaultInvoiceVatPercentUsesMarketDefault: tenant.defaultInvoiceVatPercent == null,
      defaultTaxRegistrationNumber: tenant.defaultTaxRegistrationNumber?.trim() || null,
      defaultTaxRegistrationNumberOverride: tenant.defaultTaxRegistrationNumber ?? null,
      defaultTaxRegistrationNumberUsesMarketDefault: !tenant.defaultTaxRegistrationNumber?.trim(),
      marketTaxDefaults: null,
    };
  }
  const pack = requireMarketTaxPack(tenant.market);
  const effective = tenantTaxEffectiveFromMarket(tenant.market, tenant);
  return {
    defaultVisitFee: effective.defaultVisitFee,
    defaultVisitFeeOverride: readStoredDecimal(tenant.defaultVisitFee),
    defaultVisitFeeUsesMarketDefault: tenant.defaultVisitFee == null,
    defaultInvoiceVatPercent: effective.defaultInvoiceVatPercent,
    defaultInvoiceVatPercentOverride: readStoredDecimal(tenant.defaultInvoiceVatPercent),
    defaultInvoiceVatPercentUsesMarketDefault: tenant.defaultInvoiceVatPercent == null,
    defaultTaxRegistrationNumber: effective.defaultTaxRegistrationNumber,
    defaultTaxRegistrationNumberOverride: tenant.defaultTaxRegistrationNumber ?? null,
    defaultTaxRegistrationNumberUsesMarketDefault: !tenant.defaultTaxRegistrationNumber?.trim(),
    marketTaxDefaults: {
      defaultVisitFee: pack.defaultVisitFee,
      invoiceVatPercent: pack.invoiceVatPercent,
      saasVatPercent: pack.saasVatPercent,
    },
  };
}

export function clinicRegulatoryEffective(
  clinic: {
    taxRegistrationNumber?: string | null;
    invoiceVatPercent?: { toNumber?: () => number } | number | null;
  },
  market: Pick<Market, "hostCell" | "taxConfig" | "code">,
  tenant: TenantTaxStored,
): {
  effectiveVatPercent: number;
  effectiveTaxRegistrationNumber: string | null;
  marketInvoiceVatPercent: number;
  vatUsesMarketDefault: boolean;
  trnUsesMarketDefault: boolean;
} {
  const pack = requireMarketTaxPack(market);
  const tenantEff = tenantTaxEffectiveFromMarket(market, tenant);
  const vatStored = readStoredDecimal(clinic.invoiceVatPercent);
  const trnStored = clinic.taxRegistrationNumber?.trim() || null;
  return {
    effectiveVatPercent: vatStored ?? tenantEff.defaultInvoiceVatPercent,
    effectiveTaxRegistrationNumber: trnStored ? trnStored : tenantEff.defaultTaxRegistrationNumber,
    marketInvoiceVatPercent: pack.invoiceVatPercent,
    vatUsesMarketDefault: vatStored == null,
    trnUsesMarketDefault: !trnStored,
  };
}