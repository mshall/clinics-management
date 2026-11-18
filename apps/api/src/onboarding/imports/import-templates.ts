import { ImportEntity } from "@prisma/client";
import { toCsv } from "./import-parse";

export type ImportColumn = {
  key: string;
  en: string;
  ar: string;
  required?: boolean;
  example: string;
};

export const IMPORT_COLUMNS: Record<ImportEntity, ImportColumn[]> = {
  PATIENTS: [
    { key: "firstNameEn", en: "First name (English)", ar: "الاسم الأول (إنجليزي)", example: "Mona" },
    { key: "lastNameEn", en: "Last name (English)", ar: "اسم العائلة (إنجليزي)", example: "Hassan" },
    { key: "firstNameAr", en: "First name (Arabic)", ar: "الاسم الأول (عربي)", example: "منى" },
    { key: "lastNameAr", en: "Last name (Arabic)", ar: "اسم العائلة (عربي)", example: "حسن" },
    { key: "phone", en: "Mobile", ar: "الموبايل", required: true, example: "01001234567" },
    { key: "nationalId", en: "National ID", ar: "الرقم القومي", example: "" },
    { key: "dob", en: "Date of birth (dd/mm/yyyy)", ar: "تاريخ الميلاد (يوم/شهر/سنة)", example: "21/03/1990" },
    { key: "gender", en: "Gender (M/F)", ar: "النوع (ذكر/أنثى)", example: "F" },
    { key: "email", en: "Email", ar: "البريد الإلكتروني", example: "" },
  ],
  APPOINTMENTS: [
    { key: "patientPhone", en: "Patient mobile", ar: "موبايل المريض", example: "01001234567" },
    { key: "patientMrn", en: "Patient file number (MRN)", ar: "رقم ملف المريض", example: "" },
    { key: "clinicianEmail", en: "Doctor email", ar: "بريد الطبيب", required: true, example: "doctor@clinic.com" },
    { key: "date", en: "Date (dd/mm/yyyy)", ar: "التاريخ (يوم/شهر/سنة)", required: true, example: "05/01/2027" },
    { key: "time", en: "Time (HH:mm)", ar: "الوقت (ساعة:دقيقة)", required: true, example: "17:30" },
    { key: "durationMinutes", en: "Duration (minutes)", ar: "المدة (دقائق)", example: "20" },
    { key: "status", en: "Status (SCHEDULED/COMPLETED/CANCELLED)", ar: "الحالة", example: "SCHEDULED" },
    { key: "clinic", en: "Branch name", ar: "اسم الفرع", example: "" },
    { key: "notes", en: "Notes", ar: "ملاحظات", example: "" },
  ],
  PRICE_LIST: [
    { key: "code", en: "Service code", ar: "كود الخدمة", required: true, example: "CONS" },
    { key: "nameEn", en: "Service name (English)", ar: "اسم الخدمة (إنجليزي)", example: "Consultation" },
    { key: "nameAr", en: "Service name (Arabic)", ar: "اسم الخدمة (عربي)", example: "كشف" },
    { key: "category", en: "Category", ar: "الفئة", example: "GENERAL" },
    { key: "price", en: "Price", ar: "السعر", required: true, example: "400" },
  ],
  STAFF: [
    { key: "displayName", en: "Full name", ar: "الاسم بالكامل", required: true, example: "Sara Adel" },
    { key: "email", en: "Email", ar: "البريد الإلكتروني", required: true, example: "sara@clinic.com" },
    { key: "role", en: "Role", ar: "الدور", required: true, example: "RECEPTIONIST" },
  ],
};

export function normalizeHeader(h: string): string {
  return h
    .replace(/\uFEFF/g, "")
    .replace(/\*/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Map spreadsheet header cells → column keys (accepts key, English or Arabic label). */
export function mapHeaders(entity: ImportEntity, header: string[]): { keys: (string | null)[]; missing: string[] } {
  const cols = IMPORT_COLUMNS[entity];
  const lookup = new Map<string, string>();
  for (const c of cols) {
    lookup.set(normalizeHeader(c.key), c.key);
    lookup.set(normalizeHeader(c.en), c.key);
    lookup.set(normalizeHeader(c.ar), c.key);
  }
  const keys = header.map((h) => lookup.get(normalizeHeader(h ?? "")) ?? null);
  const missing = cols.filter((c) => c.required && !keys.includes(c.key)).map((c) => c.key);
  return { keys, missing };
}

export function templateCsv(entity: ImportEntity, lang: "en" | "ar"): Buffer {
  const cols = IMPORT_COLUMNS[entity];
  const header = cols.map((c) => `${lang === "ar" ? c.ar : c.en}${c.required ? " *" : ""}`);
  return toCsv([header, cols.map((c) => c.example)]);
}
