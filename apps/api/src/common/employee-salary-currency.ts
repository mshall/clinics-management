import { BadRequestException } from "@nestjs/common";
import { isBaseCurrency } from "./base-currencies";

export function effectiveEmployeeSalaryCurrency(
  stored: string | null | undefined,
  orgBaseCurrency: string,
): string {
  const storedCode = stored?.trim();
  if (storedCode && isBaseCurrency(storedCode)) return storedCode;
  const orgCode = orgBaseCurrency.trim();
  return isBaseCurrency(orgCode) ? orgCode : "AED";
}

/** Persist null when salary follows the organization base currency. */
export function normalizeEmployeeSalaryCurrencyOverride(
  orgBaseCurrency: string,
  currency: string | null | undefined,
): string | null {
  const code = currency?.trim();
  const orgDefault = orgBaseCurrency.trim();
  if (!code || code === orgDefault) return null;
  if (!isBaseCurrency(code)) {
    throw new BadRequestException("Invalid salary currency");
  }
  return code;
}