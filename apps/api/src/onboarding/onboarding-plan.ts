/**
 * Quick-setup plan (pure). Takes a snapshot of REAL data and returns every step with its per-entity state.
 * Completion is never a manual tick: a step is done only when the data says so (the one persisted thing is an explicit "skip" for optional steps).
 * Multi-entity: steps with scope "clinic" are listed per clinic (Clinic = clinic, Nurse = practice / agency branch), each with its own
 * state and deep link carrying the entity id; a clinic added later simply appears as a new pending entity.
 */
import { DEFAULT_CLINIC_CLOSING_TIME, DEFAULT_CLINIC_OPENING_TIME } from "../common/clinic-hours";

export const SETUP_SKIPPED = "skipped";

export type SetupEdition = "CLINIC" | "NURSE";
export type SetupScope = "org" | "clinic";
export type SetupStatus = "pending" | "done" | "skipped";

/** Roles that may perform a step (the tenant owner always can). Lower-case = auth-store role strings. */
export type SetupRole =
  | "group_admin"
  | "clinic_admin"
  | "branch_manager"
  | "physician"
  | "nurse"
  | "receptionist"
  | "call_center"
  | "finance_officer"
  | "hr_officer";

export type SetupClinicSnap = {
  id: string;
  nameEn: string;
  nameAr: string;
  logoUrl: string | null;
  hasInvoiceLogo: boolean;
  licenseNumber: string;
  openingTime: string;
  closingTime: string;
  /** providerSettings.setupHoursConfirmedAt present: the owner saved the hours explicitly. */
  hoursConfirmed: boolean;
  /** Custom appointment types for this clinic (clinic-specific or tenant-wide, beyond the signup defaults). */
  appointmentTypesConfigured: boolean;
  /** A clinician availability template was saved for this clinic. */
  availabilityConfigured: boolean;
  /** Marketplace listing ready (bookable type + verified physician). */
  kiorexListingReady: boolean;
};

export type SetupSnapshot = {
  edition: SetupEdition;
  nurseKind: "SOLO" | "AGENCY" | null;
  planKey: string;
  /** Plan entitlement for WhatsApp reminders. */
  whatsAppEntitled: boolean;
  clinics: SetupClinicSnap[];
  whatsAppRemindersEnabled: boolean;
  staffInvited: boolean;
  patientCount: number;
  appointmentCount: number;
  checkedInCount: number;
  /** Earliest open (scheduled/confirmed) real appointment: the check-in step deep-links straight to it. */
  checkInAppointmentId?: string | null;
  doctorVerified: boolean;
  /** providerSettings.kiorexConnect.status */
  kiorexConnectStatus: string | null;
  /** GRW-P1-D1: live (ACTIVE or PAUSED) provider referral links of the organisation; absent in older snapshots = 0. */
  referralLinkCount?: number;
  nurse: { verified: boolean; zones: boolean; services: boolean; prices: boolean; availability: boolean; safetyContact: boolean };
};

export type SetupViewer = { isOwner: boolean; roles: SetupRole[] };

export type SetupStepKey =
  | "clinic_profile"
  | "clinic_logo"
  | "working_hours"
  | "appointment_types"
  | "doctor_availability"
  | "invite_receptionist"
  | "whatsapp_reminders"
  | "import_patients"
  | "first_appointment"
  | "first_check_in"
  | "kiorex_profile"
  | "doctor_verification"
  | "connect_kiorex"
  | "growth_links"
  | "nurse_verification"
  | "nurse_zones"
  | "nurse_services"
  | "nurse_prices"
  | "nurse_availability"
  | "nurse_safety_contact";

type Def = {
  key: SetupStepKey;
  scope: SetupScope;
  required: boolean;
  roles: SetupRole[];
  /** Plan keys that unlock the step; undefined = every plan. */
  needsEntitlement?: "whatsapp";
  /** Hidden (not just disabled) for roles that cannot perform it, e.g. Connect to Kiorex is for the owner/admin only. */
  hideIfCannot?: boolean;
  editions: SetupEdition[];
  /** Only for agencies / only for solo practitioners (Nurse edition). */
  nurseKind?: "SOLO" | "AGENCY";
  /** Rule for org-level steps and entity steps. */
  doneOrg?: (s: SetupSnapshot) => boolean;
  doneClinic?: (c: SetupClinicSnap) => boolean;
  href: (entityId?: string, snap?: SetupSnapshot) => string;
};

const ADMINS: SetupRole[] = ["group_admin", "clinic_admin", "branch_manager"];
const FRONT: SetupRole[] = ["group_admin", "clinic_admin", "branch_manager", "receptionist", "call_center"];

const withSetup = (path: string, key: string, entity?: string) => {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}setup=${key}${entity ? `&entity=${entity}` : ""}`;
};

/** Ordered catalogue. The order is the order users do the steps in. */
export const SETUP_DEFS: Def[] = [
  { key: "clinic_profile", scope: "clinic", required: true, roles: ADMINS, editions: ["CLINIC", "NURSE"],
    doneClinic: (c) => Boolean(c.licenseNumber) && c.licenseNumber !== "SELF-SERVE-PENDING",
    href: (id) => withSetup(`/clinics/${id}?tab=settings`, "clinic_profile", id) },
  { key: "clinic_logo", scope: "clinic", required: false, roles: ADMINS, editions: ["CLINIC", "NURSE"],
    doneClinic: (c) => Boolean(c.logoUrl?.trim()) || c.hasInvoiceLogo,
    href: (id) => withSetup(`/clinics/${id}?tab=settings`, "clinic_logo", id) },
  { key: "working_hours", scope: "clinic", required: true, roles: ADMINS, editions: ["CLINIC"],
    doneClinic: (c) =>
      c.hoursConfirmed || c.openingTime !== DEFAULT_CLINIC_OPENING_TIME || c.closingTime !== DEFAULT_CLINIC_CLOSING_TIME,
    href: (id) => withSetup(`/clinics/${id}?tab=settings`, "working_hours", id) },
  { key: "appointment_types", scope: "clinic", required: true, roles: ADMINS, editions: ["CLINIC"],
    doneClinic: (c) => c.appointmentTypesConfigured,
    href: (id) => withSetup(`/clinics/${id}?tab=settings`, "appointment_types", id) },
  { key: "doctor_availability", scope: "clinic", required: true, roles: [...ADMINS, "physician"], editions: ["CLINIC"],
    doneClinic: (c) => c.availabilityConfigured,
    href: (id) => withSetup(`/profile/availability`, "doctor_availability", id) },
  { key: "invite_receptionist", scope: "org", required: false, roles: ADMINS, editions: ["CLINIC", "NURSE"],
    doneOrg: (s) => s.staffInvited, href: () => withSetup("/team", "invite_receptionist") },
  { key: "whatsapp_reminders", scope: "org", required: false, roles: ["group_admin"], needsEntitlement: "whatsapp", editions: ["CLINIC"],
    doneOrg: (s) => s.whatsAppRemindersEnabled, href: () => withSetup("/admin?section=organization", "whatsapp_reminders") },
  { key: "import_patients", scope: "org", required: false, roles: FRONT, editions: ["CLINIC", "NURSE"],
    doneOrg: (s) => s.patientCount > 0, href: () => withSetup("/onboarding/import", "import_patients") },
  { key: "first_appointment", scope: "org", required: true, roles: FRONT, editions: ["CLINIC", "NURSE"],
    doneOrg: (s) => s.appointmentCount > 0, href: () => withSetup("/appointments?book=1", "first_appointment") },
  { key: "first_check_in", scope: "org", required: true, roles: FRONT, editions: ["CLINIC"],
    doneOrg: (s) => s.checkedInCount > 0, href: (_id, s) => s?.checkInAppointmentId ? withSetup(`/appointments/${s.checkInAppointmentId}`, "first_check_in") : withSetup("/front-desk/board", "first_check_in") },
  { key: "doctor_verification", scope: "org", required: false, roles: [...ADMINS, "physician"], editions: ["CLINIC"],
    doneOrg: (s) => s.doctorVerified, href: () => withSetup("/profile/verification", "doctor_verification") },
  { key: "kiorex_profile", scope: "clinic", required: false, roles: ADMINS, editions: ["CLINIC"],
    doneClinic: (c) => c.kiorexListingReady,
    href: (id) => withSetup(`/clinics/${id}?tab=settings`, "kiorex_profile", id) },
  { key: "connect_kiorex", scope: "org", required: false, hideIfCannot: true, roles: ["group_admin", "clinic_admin"], editions: ["CLINIC", "NURSE"],
    doneOrg: (s) => ["REQUESTED", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PAUSED"].includes(s.kiorexConnectStatus ?? ""),
    href: () => withSetup("/kiorex", "connect_kiorex") },
  // GRW-P1-D1: links work standalone (no Kiorex connection needed); marketing staff share the step with the admins
  { key: "growth_links", scope: "org", required: false, roles: ADMINS, editions: ["CLINIC"],
    doneOrg: (s) => (s.referralLinkCount ?? 0) > 0, href: () => withSetup("/kiorex/growth", "growth_links") },
  // Nurse edition (KNED03): the signed-in nurse's own readiness
  { key: "nurse_verification", scope: "org", required: true, roles: ["nurse", "physician", ...ADMINS], editions: ["NURSE"],
    doneOrg: (s) => s.nurse.verified, href: () => withSetup("/profile/verification", "nurse_verification") },
  { key: "nurse_zones", scope: "org", required: true, roles: ["nurse", "physician", ...ADMINS], editions: ["NURSE"], nurseKind: "SOLO",
    doneOrg: (s) => s.nurse.zones, href: () => withSetup("/nurse/onboarding", "nurse_zones") },
  { key: "nurse_services", scope: "org", required: true, roles: ["nurse", "physician", ...ADMINS], editions: ["NURSE"],
    doneOrg: (s) => s.nurse.services, href: () => withSetup("/nurse/services", "nurse_services") },
  { key: "nurse_prices", scope: "org", required: true, roles: ["nurse", "physician", ...ADMINS], editions: ["NURSE"],
    doneOrg: (s) => s.nurse.prices, href: () => withSetup("/nurse/services", "nurse_prices") },
  { key: "nurse_availability", scope: "org", required: true, roles: ["nurse", "physician", ...ADMINS], editions: ["NURSE"], nurseKind: "SOLO",
    doneOrg: (s) => s.nurse.availability, href: () => withSetup("/nurse/onboarding", "nurse_availability") },
  { key: "nurse_safety_contact", scope: "org", required: true, roles: ADMINS, editions: ["NURSE"],
    doneOrg: (s) => s.nurse.safetyContact, href: () => withSetup("/nurse/safety", "nurse_safety_contact") },
];

export type SetupEntityDto = { id: string; nameEn: string; nameAr: string; status: SetupStatus; href: string };

export type SetupStepDto = {
  key: SetupStepKey;
  order: number;
  required: boolean;
  /** Always false: every step is detected from real data. */
  manual: boolean;
  scope: SetupScope;
  status: SetupStatus;
  completedAt: string | null;
  /** Deep link of the first pending entity (or the org-level action). */
  href: string;
  /** Roles that can perform it (owner always can); shown as "Ask the owner" when canPerform is false. */
  whoCan: SetupRole[];
  canPerform: boolean;
  /** available=false means the current plan does not include it (the UI marks it "Upgrade"). */
  available: boolean;
  entities: SetupEntityDto[] | null;
  doneCount: number;
  totalCount: number;
};

export type SetupPlanDto = {
  steps: SetupStepDto[];
  /** Required units done / required units, 0..100. */
  progressPercent: number;
  /** All actionable units (done or skipped) / all, 0..100. */
  overallPercent: number;
  doneUnits: number;
  totalUnits: number;
  allDone: boolean;
  nextKey: SetupStepKey | null;
  nextHref: string | null;
};

export function skipKey(step: string, entityId?: string | null): string {
  return entityId ? `${step}@${entityId}` : step;
}

export function canPerformStep(def: { roles: SetupRole[] }, viewer: SetupViewer): boolean {
  return viewer.isOwner || def.roles.some((r) => viewer.roles.includes(r));
}

/** stored: persisted marker map (skips, plus first-completion timestamps for org steps). */
export function buildSetupPlan(snap: SetupSnapshot, stored: Record<string, string>, viewer: SetupViewer): SetupPlanDto {
  const steps: SetupStepDto[] = [];
  let order = 0;
  for (const def of SETUP_DEFS) {
    if (!def.editions.includes(snap.edition)) continue;
    if (def.nurseKind && snap.edition === "NURSE" && (snap.nurseKind ?? "SOLO") !== def.nurseKind) continue;
    if (def.hideIfCannot && !canPerformStep(def, viewer)) continue;
    order += 1;
    const available = def.needsEntitlement === "whatsapp" ? snap.whatsAppEntitled : true;
    let entities: SetupEntityDto[] | null = null;
    let status: SetupStatus;
    let doneCount = 0;
    let totalCount = 0;
    let href: string;
    let completedAt: string | null = null;
    if (def.scope === "clinic") {
      entities = snap.clinics.map((c) => {
        const done = def.doneClinic!(c);
        const sk = !done && !def.required && Boolean(stored[skipKey(def.key, c.id)] === SETUP_SKIPPED || stored[def.key] === SETUP_SKIPPED);
        return { id: c.id, nameEn: c.nameEn, nameAr: c.nameAr, status: done ? "done" : sk ? "skipped" : "pending", href: def.href(c.id) } as SetupEntityDto;
      });
      totalCount = entities.length;
      doneCount = entities.filter((e) => e.status !== "pending").length;
      const firstPending = entities.find((e) => e.status === "pending");
      status = totalCount === 0 ? "pending" : firstPending ? "pending" : entities.every((e) => e.status === "skipped") ? "skipped" : "done";
      href = (firstPending ?? entities[0])?.href ?? def.href(undefined);
      if (status === "done") completedAt = stored[def.key] && stored[def.key] !== SETUP_SKIPPED ? stored[def.key]! : null;
    } else {
      const done = def.doneOrg!(snap);
      const sk = !done && !def.required && stored[def.key] === SETUP_SKIPPED;
      status = done ? "done" : sk ? "skipped" : "pending";
      totalCount = 1;
      doneCount = status === "pending" ? 0 : 1;
      href = def.href(undefined, snap);
      if (done && stored[def.key] && stored[def.key] !== SETUP_SKIPPED) completedAt = stored[def.key]!;
    }
    steps.push({
      key: def.key,
      order,
      required: def.required,
      manual: false,
      scope: def.scope,
      status,
      completedAt,
      href,
      whoCan: def.roles,
      canPerform: canPerformStep(def, viewer),
      available,
      entities,
      doneCount,
      totalCount,
    });
  }

  // units: unavailable (plan) steps are excluded from progress
  const live = steps.filter((s) => s.available);
  const sum = (arr: SetupStepDto[], pick: (s: SetupStepDto) => number) => arr.reduce((a, s) => a + pick(s), 0);
  const req = live.filter((s) => s.required);
  const reqTotal = sum(req, (s) => Math.max(s.totalCount, 1));
  const reqDone = sum(req, (s) => s.doneCount);
  const totalUnits = sum(live, (s) => Math.max(s.totalCount, 1));
  const doneUnits = sum(live, (s) => s.doneCount);
  const next = live.find((s) => s.status === "pending") ?? null;
  return {
    steps,
    progressPercent: reqTotal === 0 ? 100 : Math.round((reqDone / reqTotal) * 100),
    overallPercent: totalUnits === 0 ? 100 : Math.round((doneUnits / totalUnits) * 100),
    doneUnits,
    totalUnits,
    allDone: totalUnits > 0 && doneUnits === totalUnits,
    nextKey: next?.key ?? null,
    nextHref: next?.href ?? null,
  };
}

/** Ordered keys that mark "required step done" for activation analytics (unchanged semantics). */
export function requiredUnitsDone(plan: SetupPlanDto): boolean {
  return plan.steps.filter((s) => s.required && s.available).every((s) => s.status !== "pending");
}
