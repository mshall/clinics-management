import type { EncounterMedicationDto } from "@/lib/api-types";

/** Served from `apps/web/public/prescription.png` (source: `Docs/Prescription/prescription.png`). */
export const PRESCRIPTION_TEMPLATE_URL = `${import.meta.env.BASE_URL}prescription.png`;

export type PrescriptionImageLabels = {
  title: string;
  patient: string;
  mrn: string;
  date: string;
  medications: string;
  signature: string;
};

export type PrescriptionImageInput = {
  clinicName: string;
  patientName: string;
  patientMrn?: string | null;
  date: Date;
  medications: EncounterMedicationDto[];
  physicianName?: string;
  labels: PrescriptionImageLabels;
  rtl?: boolean;
  /** Optional clinic header logo and description; when omitted, default template layout is unchanged. */
  branding?: {
    logo?: HTMLImageElement | null;
    headerDescription?: string | null;
  };
};

export function loadPrescriptionImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const next = `${line} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
    } else {
      lines.push(line);
      line = words[i]!;
    }
  }
  lines.push(line);
  return lines;
}

function formatMedLine(m: EncounterMedicationDto, index: number): string {
  const parts = [m.drugName];
  if (m.dosage?.trim()) parts.push(m.dosage.trim());
  if (m.frequency?.trim()) parts.push(m.frequency.trim());
  if (m.route?.trim()) parts.push(m.route.trim());
  if (m.duration?.trim()) parts.push(m.duration.trim());
  if (m.instructions?.trim()) parts.push(`— ${m.instructions.trim()}`);
  return `${index + 1}. ${parts.join(" · ")}`;
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toArabicDigits(text: string): string {
  return text.replace(/\d/g, (ch) => ARABIC_DIGITS[Number(ch)]!);
}

/** Prescription template date: Arabic label + DD/MM/YYYY in Eastern Arabic numerals. */
function formatPrescriptionDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear());
  return `التاريخ ${toArabicDigits(`${day}/${month}/${year}`)}`;
}

export async function generatePrescriptionPng(input: PrescriptionImageInput): Promise<Blob> {
  const template = await loadPrescriptionImage(PRESCRIPTION_TEMPLATE_URL);
  const width = template.naturalWidth;
  const height = template.naturalHeight;
  const rtl = input.rtl ?? false;
  const fontFamily = '"Segoe UI", Tahoma, Arial, sans-serif';

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(template, 0, 0, width, height);

  const branding = input.branding;
  const hasLogo = Boolean(branding?.logo);
  const headerDescription = branding?.headerDescription?.trim();
  if (hasLogo || headerDescription) {
    const centerX = width / 2;
    let headerY = 52;
    ctx.fillStyle = "#334155";
    ctx.textBaseline = "alphabetic";

    if (branding?.logo) {
      const maxW = 220;
      const maxH = 78;
      const scale = Math.min(maxW / branding.logo.naturalWidth, maxH / branding.logo.naturalHeight, 1);
      const w = branding.logo.naturalWidth * scale;
      const h = branding.logo.naturalHeight * scale;
      ctx.drawImage(branding.logo, centerX - w / 2, headerY, w, h);
      headerY += h + 14;
    }

    if (headerDescription) {
      ctx.font = `500 18px ${fontFamily}`;
      ctx.direction = rtl ? "rtl" : "ltr";
      ctx.textAlign = "center";
      for (const line of wrapText(ctx, headerDescription, width - 140)) {
        ctx.fillText(line, centerX, headerY);
        headerY += 24;
      }
    }
  }

  ctx.fillStyle = "#1e293b";
  ctx.textBaseline = "alphabetic";

  // Patient name — dotted line next to "الأسم" (upper-right)
  ctx.font = `600 22px ${fontFamily}`;
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  const patientX = rtl ? width - 90 : 620;
  ctx.fillText(input.patientName, patientX, 318);

  // Date — left side: Arabic label + DD/MM/YYYY
  ctx.font = `500 20px ${fontFamily}`;
  ctx.direction = "rtl";
  ctx.textAlign = "left";
  ctx.fillText(formatPrescriptionDate(input.date), 118, 318);

  // Medication list — main body below Rx symbol
  const medFontSize = 26;
  const medFont = `600 ${medFontSize}px ${fontFamily}`;
  ctx.font = medFont;
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  const medX = rtl ? width - 95 : 95;
  const medMaxWidth = width - 190;
  const lineHeight = 42;
  let y = 455;

  for (let i = 0; i < input.medications.length; i++) {
    const lines = wrapText(ctx, formatMedLine(input.medications[i]!, i), medMaxWidth);
    for (const line of lines) {
      if (y > height - 180) break;
      ctx.fillText(line, medX, y);
      y += lineHeight;
    }
    y += 10;
  }

  if (input.physicianName?.trim()) {
    ctx.font = `500 16px ${fontFamily}`;
    ctx.fillStyle = "#475569";
    ctx.textAlign = rtl ? "right" : "left";
    ctx.fillText(input.physicianName.trim(), rtl ? width - 95 : 95, height - 120);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to create prescription image"));
      },
      "image/png",
      1,
    );
  });
}
