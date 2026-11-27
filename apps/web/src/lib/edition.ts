/**
 * Kiorly Nurse is an EDITION of Kiorly Clinic (ADR-031, KX-23): same code and API, presented under its own name, accent, navigation and
 * terminology. This module is the web mirror of `apps/api/src/nurse/nurse-edition.ts` (the API sends the same data in `/nurse/context`;
 * these static tables let the signed-out surfaces (login, sign-up on nurse.kiorly.com) render before any request).
 * Visibility is presentation only: scope of practice (no prescribing for nurses) is enforced by the server.
 */
import { nurseParentDomains, nurseWebHost } from "./host-config";

export type Edition = "CLINIC" | "NURSE";
export type NurseTenantKind = "SOLO" | "AGENCY";

/** KNED02 — Nurse Rose accent on the Kiorly palette. The Arabic product name is open question Q12 (NEEDS_HUMAN): placeholder, never final. */
export const NURSE_ACCENT_HEX = "#E11D48";
export const NURSE_ACCENT_HSL = "347 83% 51%";

export function editionFromHost(hostHeader: string | undefined | null): Edition | null {
  const host = (hostHeader ?? "").toLowerCase().split(":")[0]!.trim();
  if (!host) return null;
  const nurse = nurseWebHost();
  if (host === nurse || host.endsWith(`.${nurse}`)) return "NURSE";
  for (const d of nurseParentDomains()) if (host.startsWith("nurse.") && host.endsWith(`.${d}`) && /^nurse\.[a-z0-9-]+$/.test(host.slice(0, -d.length - 1))) return "NURSE";
  if (host === "nurse.localhost" || (host.startsWith("nurse.") && host.endsWith(".localhost"))) return "NURSE";
  return null;
}

/** The signed-in org's edition wins; the host only decides before sign-in. */
export function resolveEdition(input: { orgEdition?: Edition | null; host?: string | null }): Edition {
  return input.orgEdition ?? editionFromHost(input.host) ?? "CLINIC";
}

type Overrides = Record<string, string>;

const NURSE_EN: Overrides = {
  "app.name": "Kiorly Nurse",
  "app.tagline": "Home nursing",
  "nav.dashboard": "Today",
  "nav.appointments": "Visits",
  "nav.patients": "Patients",
  "nav.encounters": "Visit records",
  "nav.revenue": "Payments",
  "nav.reports": "Reports",
  "nav.admin": "Settings",
  "nav.clinics": "Practice",
  "nav.hr": "Team",
  "nav.doctorRevenue": "Nurse revenue",
};
const NURSE_AR: Overrides = {
  "app.name": "كيورلي للتمريض",
  "app.tagline": "التمريض المنزلي",
  "nav.dashboard": "اليوم",
  "nav.appointments": "الزيارات",
  "nav.patients": "المرضى",
  "nav.encounters": "سجلات الزيارات",
  "nav.revenue": "المدفوعات",
  "nav.reports": "التقارير",
  "nav.admin": "الإعدادات",
  "nav.clinics": "الممارسة",
  "nav.hr": "الفريق",
  "nav.doctorRevenue": "إيرادات الممرضين",
};
const AGENCY_EN: Overrides = { "nav.clinics": "Agency", "nav.hr": "Team & dispatch" };
const AGENCY_AR: Overrides = { "nav.clinics": "الشركة", "nav.hr": "الفريق والتوزيع" };

/** Translation overrides for an edition (merged over the base bundle; Clinic = none). */
export function editionOverrides(edition: Edition, kind: NurseTenantKind | null | undefined, lang: "en" | "ar"): Overrides {
  if (edition !== "NURSE") return {};
  const base = lang === "ar" ? NURSE_AR : NURSE_EN;
  return kind === "AGENCY" ? { ...base, ...(lang === "ar" ? AGENCY_AR : AGENCY_EN) } : base;
}

type I18nLike = { addResource: (lng: string, ns: string, key: string, value: string) => unknown; changeLanguage?: (l: string) => unknown; language?: string };

/** Applies the edition to the live document (accent + data attribute + title) and to the i18n bundles. Idempotent. */
export function applyEdition(edition: Edition, kind: NurseTenantKind | null | undefined, i18n: I18nLike, doc: Pick<Document, "documentElement" | "title"> | null = typeof document === "undefined" ? null : document): void {
  for (const lang of ["en", "ar"] as const) {
    for (const [k, v] of Object.entries(editionOverrides(edition, kind, lang))) i18n.addResource(lang, "translation", k, v);
  }
  if (doc) {
    if (edition === "NURSE") doc.documentElement.dataset.edition = "nurse";
    else delete doc.documentElement.dataset.edition;
    if (edition === "NURSE") doc.title = "Kiorly Nurse";
  }
}
