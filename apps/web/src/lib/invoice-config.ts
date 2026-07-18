export {
  DEFAULT_INVOICE_SECTIONS,
  INVOICE_BACKGROUND_COLORS,
  INVOICE_SECTION_KEYS,
  invoiceBackgroundHex,
  type InvoiceBackgroundColorId,
  type InvoiceSectionKey,
} from "./invoice-config.shared";

export const INVOICE_SECTION_LABELS: Record<string, { en: string; ar: string }> = {
  clinicHeader: { en: "Clinic header (logo & contact)", ar: "رأس العيادة (الشعار والتواصل)" },
  patientDetails: { en: "Patient details", ar: "بيانات المريض" },
  invoiceMeta: { en: "Invoice number & date", ar: "رقم الفاتورة والتاريخ" },
  lineItems: { en: "Line items (purpose & amount)", ar: "بنود الفاتورة (الغرض والمبلغ)" },
  totals: { en: "Totals", ar: "الإجماليات" },
  footer: { en: "Footer & license", ar: "التذييل والترخيص" },
};
