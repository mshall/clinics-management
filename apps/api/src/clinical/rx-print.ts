import type { PdfRow, PdfSection } from "../billing-platform/bilingual-pdf";
import { arabicInstructionLine } from "./rx-sig-ar";

/** One line on the printed prescription: brand + active ingredient(s) + sig (EN as written, AR rendered). */
export type PrintedRxItem = {
  brand: string;
  ingredients: string[];
  strength: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  instructionsAr: string | null;
};

/** Everything that appears on the printed Rx — the upper bound for what verification may disclose. */
export type PrintedRx = {
  encounterId: string;
  clinicNameEn: string;
  clinicNameAr: string | null;
  doctorName: string;
  patientName: string;
  signedAt: string;
  items: PrintedRxItem[];
  verifyUrl: string | null;
};

export type RxVerificationView =
  | {
      status: "VALID";
      clinicNameEn: string;
      clinicNameAr: string | null;
      doctorName: string;
      patientInitials: string;
      signedAt: string;
      items: PrintedRxItem[];
      expiresAt: string;
    }
  | { status: "EXPIRED" | "REVOKED" };

export type RxMedicationSource = {
  drugName: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  drugProduct: {
    brandNameEn: string;
    strength: string | null;
    defaultSigAr: string | null;
    ingredients: { ingredient: { nameEn: string } }[];
  } | null;
};

export function printedRxItem(m: RxMedicationSource): PrintedRxItem {
  const product = m.drugProduct;
  const ingredients = product
    ? product.ingredients.map((i) => i.ingredient.nameEn.trim()).filter(Boolean)
    : [];
  return {
    brand: (product?.brandNameEn ?? m.drugName).trim(),
    ingredients,
    strength: product?.strength?.trim() || null,
    dosage: m.dosage?.trim() || null,
    frequency: m.frequency?.trim() || null,
    duration: m.duration?.trim() || null,
    instructions: m.instructions?.trim() || null,
    instructionsAr: arabicInstructionLine({
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
      defaultSigAr: product?.defaultSigAr,
    }),
  };
}

export function patientInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts
    .slice(0, 3)
    .map((p) => `${Array.from(p)[0]!.toUpperCase()}.`)
    .join(" ");
}

/**
 * Pharmacy-facing projection of a printed Rx. It is derived only from {@link PrintedRx}
 * so it can never disclose more than the paper; the patient is reduced to initials.
 */
export function toVerificationView(printed: PrintedRx, expiresAt: Date): RxVerificationView {
  return {
    status: "VALID",
    clinicNameEn: printed.clinicNameEn,
    clinicNameAr: printed.clinicNameAr,
    doctorName: printed.doctorName,
    patientInitials: patientInitials(printed.patientName),
    signedAt: printed.signedAt,
    items: printed.items.map((i) => ({ ...i, ingredients: [...i.ingredients] })),
    expiresAt: expiresAt.toISOString(),
  };
}

function itemLineEn(item: PrintedRxItem, idx: number): string {
  const head = [item.brand, item.strength].filter(Boolean).join(" ");
  const ingr = item.ingredients.length ? ` (${item.ingredients.join(" + ")})` : "";
  const sig = [item.dosage, item.frequency, item.duration].filter(Boolean).join(" · ");
  return `${idx + 1}. ${head}${ingr}${sig ? ` — ${sig}` : ""}`;
}

/** Bilingual PDF for WhatsApp share: Arabic page first (patient-facing), English page second. */
export function prescriptionPdfSections(printed: PrintedRx): PdfSection[] {
  const date = printed.signedAt.slice(0, 10);
  const qr: PdfRow[] = printed.verifyUrl ? [{ kind: "gap", height: 10 }, { kind: "qr", text: printed.verifyUrl, size: 110 }] : [];
  const ar: PdfRow[] = [
    { kind: "text", text: printed.clinicNameAr?.trim() || printed.clinicNameEn, size: 16, bold: true },
    { kind: "pair", label: "الطبيب", value: printed.doctorName },
    { kind: "pair", label: "المريض", value: printed.patientName },
    { kind: "pair", label: "التاريخ", value: date },
    { kind: "rule" },
    { kind: "text", text: "روشتة", size: 13, bold: true },
  ];
  printed.items.forEach((item, idx) => {
    ar.push({ kind: "text", text: itemLineEn(item, idx), size: 11, bold: true });
    if (item.instructionsAr) ar.push({ kind: "text", text: item.instructionsAr, size: 11 });
    if (item.instructions) ar.push({ kind: "text", text: item.instructions, size: 10 });
    ar.push({ kind: "gap", height: 4 });
  });
  ar.push({ kind: "rule" });
  ar.push({ kind: "text", text: "امسح رمز QR للتحقق من صحة الروشتة.", size: 9 });
  ar.push(...qr);

  const en: PdfRow[] = [
    { kind: "text", text: printed.clinicNameEn, size: 16, bold: true },
    { kind: "pair", label: "Doctor", value: printed.doctorName },
    { kind: "pair", label: "Patient", value: printed.patientName },
    { kind: "pair", label: "Date", value: date },
    { kind: "rule" },
    { kind: "text", text: "Prescription", size: 13, bold: true },
  ];
  printed.items.forEach((item, idx) => {
    en.push({ kind: "text", text: itemLineEn(item, idx), size: 11, bold: true });
    if (item.instructions) en.push({ kind: "text", text: item.instructions, size: 10 });
    en.push({ kind: "gap", height: 4 });
  });
  en.push({ kind: "rule" });
  en.push({ kind: "text", text: "Scan the QR code to verify this prescription.", size: 9 });
  en.push(...qr);

  return [
    { direction: "rtl", rows: ar },
    { direction: "ltr", rows: en },
  ];
}
