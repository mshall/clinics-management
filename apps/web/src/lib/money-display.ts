import { BASE_CURRENCY_OPTIONS, type BaseCurrency } from "@/lib/base-currencies";

const SUPPORTED = new Set<string>(BASE_CURRENCY_OPTIONS.map((o) => o.value));

export function asBaseCurrency(currency: string | null | undefined, fallback: BaseCurrency = "AED"): BaseCurrency {
  const trimmed = currency?.trim();
  return trimmed && SUPPORTED.has(trimmed) ? (trimmed as BaseCurrency) : fallback;
}

export function resolveClinicCurrencyCode(
  clinics: Array<{ id: string; defaultCurrency?: string }>,
  clinicId: string | undefined,
  orgBaseCurrency?: string | null,
): BaseCurrency {
  const fallback = asBaseCurrency(orgBaseCurrency);
  if (!clinicId) return fallback;
  const code = clinics.find((c) => c.id === clinicId)?.defaultCurrency?.trim();
  return code && SUPPORTED.has(code) ? (code as BaseCurrency) : fallback;
}

export function formatMoneyAmount(amount: number, currency: string, locale: string): string {
  const code = asBaseCurrency(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(amount);
}

export function formatMultiCurrencyAmounts(
  rows: Array<{ currency: string; amount: number }>,
  locale: string,
): string {
  if (!rows.length) return "—";
  return rows.map((row) => formatMoneyAmount(row.amount, row.currency, locale)).join(" · ");
}

export function resolveEmployeeSalaryCurrency(
  employee: {
    salaryCurrency?: string | null;
    salaryCurrencyEffective?: string | null;
    clinicId: string;
  },
  clinics: Array<{ id: string; defaultCurrency?: string }>,
  orgBaseCurrency?: string | null,
): BaseCurrency {
  if (employee.salaryCurrencyEffective) return asBaseCurrency(employee.salaryCurrencyEffective);
  if (employee.salaryCurrency) return asBaseCurrency(employee.salaryCurrency);
  return resolveClinicCurrencyCode(clinics, employee.clinicId, orgBaseCurrency);
}

export function formatEmployeeSalaryAmount(
  employee: { salaryBase: number; salaryCurrency?: string | null; salaryCurrencyEffective?: string | null; clinicId: string },
  clinics: Array<{ id: string; defaultCurrency?: string }>,
  locale: string,
  orgBaseCurrency?: string | null,
): string {
  return formatMoneyAmount(
    employee.salaryBase,
    resolveEmployeeSalaryCurrency(employee, clinics, orgBaseCurrency),
    locale,
  );
}
