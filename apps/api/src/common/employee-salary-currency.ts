import { BadRequestException } from "@nestjs/common";
import { isBaseCurrency } from "./base-currencies";

export function effectiveEmployeeSalaryCurrency(
  stored: string | null | undefined,
  clinicDefaultCurrency: string,
): string {
  const storedCode = stored?.trim();
  if (storedCode && isBaseCurrency(storedCode)) return storedCode;
  const clinicCode = clinicDefaultCurrency.trim();
  return isBaseCurrency(clinicCode) ? clinicCode : "AED";
}

/** Persist null when salary follows the clinic default currency. */
export function normalizeEmployeeSalaryCurrencyOverride(
  clinicDefaultCurrency: string,
  currency: string | null | undefined,
): string | null {
  const code = currency?.trim();
  const clinicDefault = clinicDefaultCurrency.trim();
  if (!code || code === clinicDefault) return null;
  if (!isBaseCurrency(code)) {
    throw new BadRequestException("Invalid salary currency");
  }
  return code;
}
