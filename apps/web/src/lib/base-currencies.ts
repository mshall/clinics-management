export const BASE_CURRENCY_OPTIONS = [
  { value: "EGP", label: "EGP" },
  { value: "AED", label: "AED" },
  { value: "QAR", label: "QAR" },
  { value: "SAR", label: "SAR" },
  { value: "OMR", label: "OMR" },
  { value: "USD", label: "USD" },
  { value: "GBP", label: "GBP" },
  { value: "EUR", label: "EURO" },
] as const;

export type BaseCurrency = (typeof BASE_CURRENCY_OPTIONS)[number]["value"];
