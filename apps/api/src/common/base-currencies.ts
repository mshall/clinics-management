export const BASE_CURRENCIES = ["EGP", "AED", "QAR", "SAR", "OMR", "USD", "GBP", "EUR"] as const;

export type BaseCurrency = (typeof BASE_CURRENCIES)[number];

export function isBaseCurrency(value: string): value is BaseCurrency {
  return (BASE_CURRENCIES as readonly string[]).includes(value);
}
