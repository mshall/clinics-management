/**
 * DEV ONLY synthetic Kiorly Clinic personas (clinics-management/DEMO_DATA.md, seeded by `npm run db:seed:demo`).
 * Imported only by ./dev-test-users.tsx, which the login page loads behind `import.meta.env.DEV`, so none of this reaches a production bundle.
 */
export const DEMO_PASSWORD = "Demo@12345";
export const LEGACY_PASSWORD = "demo";

export type DevGroupKey = "nileCare" | "delta" | "smile" | "basic" | "nurse" | "legacy";
export interface DevUser { email: string; name: string; role: string; group: DevGroupKey; password: string }

const u = (email: string, name: string, role: string, group: DevGroupKey, password = DEMO_PASSWORD): DevUser => ({ email, name, role, group, password });
const D = "@demo.kiorex.test"; const N = "@nurse-demo.kiorly.test";

export const DEV_GROUPS: Record<DevGroupKey, { en: string; ar: string }> = {
  nileCare: { en: "Nile Care Medical Center (PRO)", ar: "مركز نايل كير الطبي (PRO)" },
  delta: { en: "Delta Family Clinics (PRO)", ar: "عيادات دلتا العائلية (PRO)" },
  smile: { en: "Smile & Skin Studio (Lite trial)", ar: "استوديو سمايل آند سكين (Lite تجريبي)" },
  basic: { en: "Corner Family Clinic (Basic)", ar: "عيادة الركن العائلية (Basic)" },
  nurse: { en: "Nurse edition (solo + agency)", ar: "نسخة التمريض (فردي ووكالة)" },
  legacy: { en: "Older demo accounts (password demo)", ar: "حسابات تجريبية أقدم (كلمة المرور demo)" },
};

export const DEV_USERS: DevUser[] = [
  u(`owner.na${D}`, "Ahmed Fawzy", "Owner / group admin", "nileCare"),
  u(`manager.na${D}`, "Branch manager", "Branch manager", "nileCare"),
  u(`frontdesk1.na${D}`, "Front desk 1", "Receptionist", "nileCare"),
  u(`nurse.na${D}`, "Nurse", "Nurse", "nileCare"),
  u(`accountant.na${D}`, "Accountant", "Finance officer", "nileCare"),
  u(`callcenter.na${D}`, "Call centre", "Call centre", "nileCare"),
  u(`nadia.na${D}`, "Dr Nadia Fouad", "Doctor (paediatrics)", "nileCare"),
  u(`walid.na${D}`, "Dr Walid", "Doctor (dermatology)", "nileCare"),
  u(`tamer.na${D}`, "Dr Tamer", "Doctor (cardiology)", "nileCare"),
  u(`mai.na${D}`, "Dr Mai Hassan", "Physiotherapist (physio pack)", "nileCare"),
  u(`owner.df${D}`, "Delta owner", "Owner / group admin", "delta"),
  u(`ola.df${D}`, "Dr Ola", "Doctor (paediatrics)", "delta"),
  u(`samah.df${D}`, "Dr Samah", "Doctor (listing paused, licence expired)", "delta"),
  u(`owner.ss${D}`, "Smile & Skin owner", "Owner (HR and operations tabs)", "smile"),
  u(`lamia.ss${D}`, "Dr Lamia", "Doctor (dermatology)", "smile"),
  u(`owner.basic${D}`, "Ramy Hafez", "Owner (Basic plan)", "basic"),
  u(`doctor.basic${D}`, "Dr Heba Lotfy", "Doctor (Basic plan)", "basic"),
  u(`nurse.basic${D}`, "Mervat Adel", "Nurse (Basic plan)", "basic"),
  u(`mona${N}`, "Mona Adel", "Solo nurse (Nurse edition)", "nurse"),
  u(`owner${N}`, "Agency owner", "Agency owner (Nurse edition)", "nurse"),
  u(`dispatch${N}`, "Dina Dispatcher", "Dispatcher (Nurse edition)", "nurse"),
  u(`nurse1${N}`, "Heba Nurse", "Agency nurse (verified)", "nurse"),
  u(`aide${N}`, "Aya Aide", "Care aide (refused by dispatch)", "nurse"),
  u("admin@kiorly.com", "Group admin", "Kiorly Clinic Group (Enterprise)", "legacy", LEGACY_PASSWORD),
  u("superadmin@kiorly.com", "Platform super admin", "Platform tab, create orgs", "legacy", LEGACY_PASSWORD),
  u("admin@drahmedshall.com", "Dr Ahmed Shall Group admin", "42 users", "legacy", LEGACY_PASSWORD),
];
