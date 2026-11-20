/**
 * Kiorly Nurse = an EDITION of Kiorly Clinic (ADR-031, KX-23): same code, database, commerce kernel and Kiorex connector.
 * The edition changes name, navigation, terminology, plans and visible modules, never the data model or the API.
 * Pure data + functions: shared by the API (`/nurse/edition`), signup and tests; the web mirrors it in `apps/web/src/lib/edition.ts`.
 */
export const EDITIONS = ["CLINIC", "NURSE"] as const;
export type Edition = (typeof EDITIONS)[number];
export type NurseTenantKind = "SOLO" | "AGENCY";

export function isEdition(v: unknown): v is Edition {
  return v === "CLINIC" || v === "NURSE";
}

/** KNED02 — Nurse Rose accent on the Kiorly palette. The Arabic product name is open question Q12 (NEEDS_HUMAN): placeholder only. */
export const NURSE_BRAND = Object.freeze({
  nameEn: "Kiorly Nurse",
  /** NEEDS_HUMAN (Q12): final Arabic name pending CEO + brand. Never ship this placeholder as the final name. */
  nameAr: "كيورلي للتمريض",
  nameArStatus: "PLACEHOLDER_NEEDS_HUMAN",
  accent: "#E11D48",
  accentName: "Nurse Rose",
  /** The Kiorly palette is unchanged; only the accent differs from Kiorly Clinic. */
  palette: "kiorly",
  host: "nurse.kiorly.com",
});

export const CLINIC_BRAND = Object.freeze({ nameEn: "Kiorly Clinic", nameAr: "كيورلي كلينيك", accent: null, host: "app.kiorly.com" });

/**
 * KX-23 §03 terminology: "Clinic" -> "Practice" (solo) / "Agency"; "Encounter" -> "Visit record"; "Doctor" -> "Nurse"; plus the
 * dispatcher label for front-desk roles in an agency. Keys are the clinic-edition English terms (stable lookup keys).
 */
export type TermKey = "clinic" | "encounter" | "encounters" | "doctor" | "doctors" | "receptionist" | "patient_visit";
type Term = { en: string; ar: string };

const NURSE_TERMS_SOLO: Record<TermKey, Term> = {
  clinic: { en: "Practice", ar: "الممارسة" },
  encounter: { en: "Visit record", ar: "سجل الزيارة" },
  encounters: { en: "Visit records", ar: "سجلات الزيارات" },
  doctor: { en: "Nurse", ar: "ممرض" },
  doctors: { en: "Nurses", ar: "الممرضون" },
  receptionist: { en: "Assistant", ar: "مساعد" },
  patient_visit: { en: "Visit", ar: "زيارة" },
};
const NURSE_TERMS_AGENCY: Record<TermKey, Term> = {
  ...NURSE_TERMS_SOLO,
  clinic: { en: "Agency", ar: "الشركة" },
  receptionist: { en: "Dispatcher", ar: "منسّق" },
};
const CLINIC_TERMS: Record<TermKey, Term> = {
  clinic: { en: "Clinic", ar: "العيادة" },
  encounter: { en: "Encounter", ar: "الزيارة الطبية" },
  encounters: { en: "Encounters", ar: "الزيارات الطبية" },
  doctor: { en: "Doctor", ar: "طبيب" },
  doctors: { en: "Doctors", ar: "الأطباء" },
  receptionist: { en: "Receptionist", ar: "موظف الاستقبال" },
  patient_visit: { en: "Appointment", ar: "موعد" },
};

export function terminologyFor(edition: Edition, kind: NurseTenantKind | null | undefined): Record<TermKey, Term> {
  if (edition !== "NURSE") return CLINIC_TERMS;
  return kind === "AGENCY" ? NURSE_TERMS_AGENCY : NURSE_TERMS_SOLO;
}

/** KX-23 §03 — the seven tabs (+ Team and Dispatch for agencies). Ids map onto existing nav tabs; labels carry the edition vocabulary. */
export type NurseTab = { id: string; navTab: string; labelEn: string; labelAr: string };
const NURSE_TABS: NurseTab[] = [
  { id: "today", navTab: "dashboard", labelEn: "Today", labelAr: "اليوم" },
  { id: "visits", navTab: "appointments", labelEn: "Visits", labelAr: "الزيارات" },
  { id: "patients", navTab: "patients", labelEn: "Patients", labelAr: "المرضى" },
  { id: "care_plans", navTab: "encounters", labelEn: "Care plans", labelAr: "خطط الرعاية" },
  { id: "payments", navTab: "revenue", labelEn: "Payments", labelAr: "المدفوعات" },
  { id: "reports", navTab: "reports", labelEn: "Reports", labelAr: "التقارير" },
  { id: "settings", navTab: "admin", labelEn: "Settings", labelAr: "الإعدادات" },
];
const AGENCY_TABS: NurseTab[] = [
  { id: "team", navTab: "hr", labelEn: "Team", labelAr: "الفريق" },
  { id: "dispatch", navTab: "appointments", labelEn: "Dispatch", labelAr: "التوزيع" },
];

export function navigationFor(edition: Edition, kind: NurseTenantKind | null | undefined): NurseTab[] | null {
  if (edition !== "NURSE") return null; // Clinic edition keeps its existing role/plan nav presets
  return kind === "AGENCY" ? [...NURSE_TABS.slice(0, 6), ...AGENCY_TABS, NURSE_TABS[6]!] : NURSE_TABS;
}

/**
 * Modules the Nurse edition HIDES (KX-23 §03). Enforced server-side by scope of practice (PRSOP) where it matters for safety
 * (prescribing, lab ordering); the rest is presentation. Hidden modules are never deleted: tenant data stays readable/exportable.
 */
export const NURSE_HIDDEN_MODULES = ["drug_prescribing", "soap_specialty_templates", "lab_ordering", "operations_or", "payers_tpa"] as const;

/** KNED02 — host handling. nurse.kiorly.com (and nurse.<anything>.localhost for dev) means NURSE; everything else means "use the org's edition". */
export function editionFromHost(hostHeader: string | undefined | null): Edition | null {
  const host = (hostHeader ?? "").toLowerCase().split(":")[0]!.trim();
  if (!host) return null;
  if (host === "nurse.kiorly.com" || host.endsWith(".nurse.kiorly.com")) return "NURSE";
  if (/^nurse\.[a-z0-9-]+\.kiorly\.(com|link)$/.test(host)) return "NURSE"; // nurse.staging.kiorly.com style
  if (host === "nurse.localhost" || host.startsWith("nurse.") && host.endsWith(".localhost")) return "NURSE";
  return null;
}

/**
 * Edition for a request: the organization's own edition always wins once signed in (a nurse tenant opened on app.kiorly.com is still
 * NURSE, and a clinic tenant opened on nurse.kiorly.com is still CLINIC: a host never changes data). The host decides only for
 * not-yet-signed-in surfaces (login, sign-up).
 */
export function resolveEdition(input: { orgEdition?: Edition | null; host?: string | null }): Edition {
  if (input.orgEdition) return input.orgEdition;
  return editionFromHost(input.host) ?? "CLINIC";
}

/** KNED04 — only the Kiorex super admin may change an organization's edition; a clinic that employs nurses stays CLINIC. */
export function canChangeEdition(actor: { isPlatformSuperAdmin: boolean }): boolean {
  return actor.isPlatformSuperAdmin;
}

/** OIDC (Kiorex Passport): one client for both editions (aud = kiorly-clinic); the edition is a UI default, never a token claim. */
export const OIDC_AUDIENCE = "kiorly-clinic";
export const OIDC_NURSE_REDIRECT_HOST = "nurse.kiorly.com";
