export const BASE_CURRENCY_OPTIONS = [
  { value: "AED", label: "AED" },
  { value: "SAR", label: "SAR" },
  { value: "QAR", label: "QAR" },
  { value: "KWD", label: "KWD" },
  { value: "BHD", label: "BHD" },
  { value: "OMR", label: "OMR" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "EGP", label: "EGP" },
  { value: "JOD", label: "JOD" },
  { value: "LBP", label: "LBP" },
  { value: "TRY", label: "TRY" },
  { value: "INR", label: "INR" },
] as const;

export type BaseCurrency = (typeof BASE_CURRENCY_OPTIONS)[number]["value"];
