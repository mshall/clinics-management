export const INVOICE_SECTION_KEYS = [
  "clinicHeader",
  "patientDetails",
  "invoiceMeta",
  "lineItems",
  "totals",
  "footer",
] as const;

export type InvoiceSectionKey = (typeof INVOICE_SECTION_KEYS)[number];

export const DEFAULT_INVOICE_SECTIONS: InvoiceSectionKey[] = [...INVOICE_SECTION_KEYS];

export const INVOICE_BACKGROUND_COLORS = [
  { id: "white", hex: "#ffffff", label: "White" },
  { id: "ivory", hex: "#fffff0", label: "Ivory" },
  { id: "sky", hex: "#e0f2fe", label: "Sky blue" },
  { id: "mint", hex: "#ecfdf5", label: "Mint" },
  { id: "lavender", hex: "#f3e8ff", label: "Lavender" },
  { id: "peach", hex: "#ffedd5", label: "Peach" },
  { id: "rose", hex: "#ffe4e6", label: "Rose" },
  { id: "sand", hex: "#fef3c7", label: "Sand" },
  { id: "slate", hex: "#f1f5f9", label: "Light slate" },
  { id: "cream", hex: "#faf7f2", label: "Cream" },
] as const;

export type InvoiceBackgroundColorId = (typeof INVOICE_BACKGROUND_COLORS)[number]["id"];

export function invoiceBackgroundHex(colorId: string): string {
  return INVOICE_BACKGROUND_COLORS.find((c) => c.id === colorId)?.hex ?? "#ffffff";
}
