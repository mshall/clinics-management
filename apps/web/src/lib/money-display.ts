import { BASE_CURRENCY_OPTIONS, type BaseCurrency } from "@/lib/base-currencies";

const SUPPORTED = new Set<string>(BASE_CURRENCY_OPTIONS.map((o) => o.value));

function asBaseCurrency(currency: string, fallback: BaseCurrency = "AED"): BaseCurrency {
  return SUPPORTED.has(currency) ? (currency as BaseCurrency) : fallback;
}

export function resolveClinicCurrencyCode(
  clinics: Array<{ id: string; defaultCurrency?: string }>,
  clinicId: string | undefined,
  fallback: BaseCurrency = "AED",
): BaseCurrency {
  if (!clinicId) return fallback;
  const code = clinics.find((c) => c.id === clinicId)?.defaultCurrency?.trim();
  return code && SUPPORTED.has(code) ? (code as BaseCurrency) : fallback;
}

export function formatMoneyAmount(amount: number, currency: string, locale: string): string {
  const code = asBaseCurrency(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(amount);
}
