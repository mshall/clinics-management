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

const COLOR_IDS = new Set<string>(INVOICE_BACKGROUND_COLORS.map((c) => c.id));

export function isInvoiceBackgroundColorId(value: string): value is InvoiceBackgroundColorId {
  return COLOR_IDS.has(value);
}

export function invoiceBackgroundHex(colorId: string): string {
  return INVOICE_BACKGROUND_COLORS.find((c) => c.id === colorId)?.hex ?? "#ffffff";
}

export function normalizeInvoiceSections(value: unknown): InvoiceSectionKey[] {
  if (!Array.isArray(value)) return DEFAULT_INVOICE_SECTIONS;
  const allowed = new Set<string>(INVOICE_SECTION_KEYS);
  const picked = value.filter((v): v is InvoiceSectionKey => typeof v === "string" && allowed.has(v));
  return picked.length > 0 ? picked : DEFAULT_INVOICE_SECTIONS;
}

export type ClinicInvoiceSettingsDto = {
  invoiceBackgroundColor: string;
  invoiceBackgroundHex: string;
  invoiceSections: InvoiceSectionKey[];
  hasInvoiceLogo: boolean;
};

export function clinicInvoiceSettingsFromRow(row: {
  invoiceBackgroundColor: string;
  invoiceSections: unknown;
  invoiceLogoRelativePath: string | null;
}): ClinicInvoiceSettingsDto {
  return {
    invoiceBackgroundColor: row.invoiceBackgroundColor || "white",
    invoiceBackgroundHex: invoiceBackgroundHex(row.invoiceBackgroundColor || "white"),
    invoiceSections: normalizeInvoiceSections(row.invoiceSections),
    hasInvoiceLogo: Boolean(row.invoiceLogoRelativePath),
  };
}
