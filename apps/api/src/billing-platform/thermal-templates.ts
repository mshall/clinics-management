import { buildBilingualPdf, type PdfRow, type PdfSection } from "./bilingual-pdf";

/** UX-04 — known 80 mm thermal printer profiles (paper width in mm; PDF uses 226.77 pt ≈ 80 mm). */
export const THERMAL_PRINTER_PROFILES = {
  "epson-tm-t20iii": {
    id: "epson-tm-t20iii",
    nameEn: "Epson TM-T20III",
    nameAr: "إبسون TM-T20III",
    paperWidthMm: 80,
    pdfWidthPt: 226.77,
    density: "normal" as const,
  },
  "star-tsp143iii": {
    id: "star-tsp143iii",
    nameEn: "Star TSP143III",
    nameAr: "ستار TSP143III",
    paperWidthMm: 80,
    pdfWidthPt: 226.77,
    density: "normal" as const,
  },
} as const;

export type ThermalPrinterProfileId = keyof typeof THERMAL_PRINTER_PROFILES;

export function listThermalPrinterProfiles() {
  return Object.values(THERMAL_PRINTER_PROFILES);
}

export function resolveThermalProfile(id?: string | null) {
  if (id && id in THERMAL_PRINTER_PROFILES) {
    return THERMAL_PRINTER_PROFILES[id as ThermalPrinterProfileId];
  }
  return THERMAL_PRINTER_PROFILES["epson-tm-t20iii"];
}

export function buildThermalQueueTicketPdf(input: {
  clinicNameEn: string;
  clinicNameAr: string;
  ticketNumber: number;
  patientName?: string;
  locale?: "en" | "ar";
}): Buffer {
  const ar = input.locale !== "en";
  const rows: PdfRow[] = [
    { kind: "text", text: ar ? input.clinicNameAr || input.clinicNameEn : input.clinicNameEn, bold: true, size: 12 },
    { kind: "gap", height: 6 },
    { kind: "text", text: ar ? "رقم الانتظار" : "Queue ticket", size: 9 },
    { kind: "text", text: `#${input.ticketNumber}`, bold: true, size: 28 },
    { kind: "gap", height: 4 },
  ];
  if (input.patientName) {
    rows.push({ kind: "text", text: input.patientName, size: 10 });
  }
  rows.push({ kind: "rule" }, { kind: "text", text: new Date().toLocaleString(ar ? "ar-EG" : "en-GB"), size: 8 });

  const section: PdfSection = {
    direction: ar ? "rtl" : "ltr",
    rows,
  };
  return buildBilingualPdf([section], { format: "THERMAL_80" });
}

export function buildThermalPaymentReceiptPdf(input: {
  clinicNameEn: string;
  clinicNameAr: string;
  receiptNumber: string;
  patientName: string;
  lines: { label: string; amount: string }[];
  total: string;
  currency: string;
  method?: string;
  locale?: "en" | "ar";
}): Buffer {
  const ar = input.locale !== "en";
  const rows: PdfRow[] = [
    { kind: "text", text: ar ? input.clinicNameAr || input.clinicNameEn : input.clinicNameEn, bold: true, size: 11 },
    { kind: "text", text: ar ? "إيصال دفع" : "Payment receipt", size: 9 },
    { kind: "text", text: input.receiptNumber, size: 8 },
    { kind: "rule" },
    { kind: "text", text: input.patientName, size: 10 },
    { kind: "gap", height: 4 },
  ];
  for (const line of input.lines) {
    rows.push({ kind: "pair", label: line.label, value: line.amount, size: 9 });
  }
  rows.push(
    { kind: "rule" },
    { kind: "pair", label: ar ? "الإجمالي" : "Total", value: `${input.total} ${input.currency}`, bold: true, size: 11 },
  );
  if (input.method) {
    rows.push({ kind: "text", text: `${ar ? "الطريقة" : "Method"}: ${input.method}`, size: 8 });
  }
  rows.push({ kind: "gap", height: 6 }, { kind: "text", text: new Date().toLocaleString(ar ? "ar-EG" : "en-GB"), size: 8 });

  return buildBilingualPdf([{ direction: ar ? "rtl" : "ltr", rows }], { format: "THERMAL_80" });
}

/** Extract MediaBox width from a minimal PDF (for printer profile gates). */
export function pdfMediaBoxWidth(pdf: Buffer): number | null {
  const m = pdf.toString("latin1").match(/MediaBox \[0 0 ([\d.]+) /);
  return m ? Number(m[1]) : null;
}
