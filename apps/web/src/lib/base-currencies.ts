export const BASE_CURRENCY_OPTIONS = [
  { value: "EGP", label: "EGP" },
  { value: "USD", label: "USD" },
  { value: "OMR", label: "OMR" },
  { value: "SAR", label: "SAR" },
  { value: "AED", label: "AED" },
] as const;

export type BaseCurrency = (typeof BASE_CURRENCY_OPTIONS)[number]["value"];
