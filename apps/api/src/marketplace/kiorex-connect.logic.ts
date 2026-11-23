/**
 * "Connect to Kiorex" (ADR-040): pure step model for a clinic / nurse organisation that started STANDALONE.
 * The API computes this from real state; the wizard only renders it. No I/O here so it is unit tested without a database.
 */
export type ConnectStatus = "STANDALONE" | "CONSENTED" | "REQUESTED" | "CHANGES_REQUESTED" | "REJECTED" | "APPROVED" | "PAUSED";
export type StepStatus = "done" | "action_needed" | "waiting_kiorex" | "blocked";
export type ConnectStepKey = "subscription" | "entitlement" | "credentials" | "appointment_types" | "availability" | "profile" | "consent" | "options" | "request" | "live";

export const KIOREX_TERMS_VERSION = "2026-11";

export interface ConnectDoctorFacts {
  listingId: string;
  clinicianId: string;
  name: string;
  verification: "VERIFIED" | "PENDING" | "REJECTED" | "EXPIRED" | "UNVERIFIED" | "NONE";
  hasAvailability: boolean;
  profilePercent: number;
  profileMissing: string[];
  status: "DRAFT" | "PENDING_VERIFICATION" | "LIVE" | "PAUSED";
  pausedReason: string | null;
}
export interface ConnectFacts {
  connectStatus: ConnectStatus;
  subscription: "TRIALING" | "ACTIVE" | "PAST_DUE" | "GRACE" | "READ_ONLY" | "SUSPENDED" | "CANCELLED" | "NONE";
  entitlementOn: boolean;
  bookableTypes: number;
  bookableTypesWithFee: number;
  doctors: ConnectDoctorFacts[];
  profileMin: number;
  consentGiven: boolean;
  /** NURSE edition: home visits are the relevant option; CLINIC: telehealth. Optional, never blocking. */
  edition: "CLINIC" | "NURSE";
  optionConfigured: boolean;
}
export interface ConnectStep { key: ConnectStepKey; status: StepStatus; optional?: boolean; /** deep link inside Kiorly Clinic */ link?: string; detail?: Record<string, unknown> }

const PROFILE_OK = (d: ConnectDoctorFacts, min: number) => d.profilePercent >= min;
export const doctorReady = (d: ConnectDoctorFacts, min: number) => d.verification === "VERIFIED" && d.hasAvailability && PROFILE_OK(d, min);

export function computeConnectSteps(f: ConnectFacts): ConnectStep[] {
  const docs = f.doctors;
  const verified = docs.filter((d) => d.verification === "VERIFIED").length;
  const pending = docs.filter((d) => d.verification === "PENDING").length;
  const withAvail = docs.filter((d) => d.hasAvailability).length;
  const profileOk = docs.filter((d) => PROFILE_OK(d, f.profileMin)).length;
  const requestedOrLater = ["REQUESTED", "APPROVED", "PAUSED"].includes(f.connectStatus);
  const steps: ConnectStep[] = [];
  const sub = f.subscription;
  steps.push({ key: "subscription", status: sub === "ACTIVE" || sub === "TRIALING" ? "done" : sub === "PAST_DUE" || sub === "GRACE" ? "action_needed" : "blocked", link: "/admin", detail: { subscription: sub } });
  steps.push({ key: "entitlement", status: f.entitlementOn ? "done" : "blocked", detail: { flag: "clinic.kiorex_listing" } });
  steps.push({ key: "credentials", status: verified > 0 ? "done" : pending > 0 ? "waiting_kiorex" : "action_needed", link: "/profile/verification", detail: { verified, pending, total: docs.length } });
  steps.push({ key: "appointment_types", status: f.bookableTypesWithFee > 0 ? "done" : "action_needed", link: "/kiorex", detail: { bookable: f.bookableTypes, withFee: f.bookableTypesWithFee } });
  steps.push({ key: "availability", status: withAvail > 0 ? "done" : "action_needed", link: "/clinics/:clinicId", detail: { doctors: withAvail, total: docs.length } });
  steps.push({ key: "profile", status: profileOk > 0 ? "done" : "action_needed", link: "/kiorex", detail: { doctors: profileOk, total: docs.length, min: f.profileMin, missing: [...new Set(docs.flatMap((d) => d.profileMissing))] } });
  steps.push({ key: "consent", status: f.consentGiven ? "done" : "action_needed", detail: { termsVersion: KIOREX_TERMS_VERSION } });
  steps.push({ key: "options", status: f.optionConfigured ? "done" : "action_needed", optional: true, link: f.edition === "NURSE" ? "/nurse/services" : "/profile", detail: { edition: f.edition } });
  const required = steps.filter((s) => !s.optional);
  const allDone = required.every((s) => s.status === "done");
  const anyReady = docs.some((d) => doctorReady(d, f.profileMin));
  // Request to go live: available only when every prerequisite is done and at least one doctor is fully ready.
  const reqStatus: StepStatus = f.connectStatus === "APPROVED" ? "done" : requestedOrLater ? "waiting_kiorex" : allDone && anyReady ? "action_needed" : "blocked";
  steps.push({ key: "request", status: f.connectStatus === "CHANGES_REQUESTED" || f.connectStatus === "REJECTED" ? "action_needed" : reqStatus, detail: { connectStatus: f.connectStatus } });
  const liveCount = docs.filter((d) => d.status === "LIVE").length;
  steps.push({ key: "live", status: f.connectStatus === "APPROVED" && liveCount > 0 ? "done" : f.connectStatus === "APPROVED" ? "action_needed" : f.connectStatus === "PAUSED" ? "blocked" : "blocked", detail: { live: liveCount, total: docs.length } });
  return steps;
}

export function canRequestGoLive(steps: ConnectStep[]): boolean {
  return steps.find((s) => s.key === "request")?.status === "action_needed" && steps.filter((s) => !s.optional && !["request", "live"].includes(s.key)).every((s) => s.status === "done");
}

/** Share of required steps that are done (request and live included), for the progress bar. */
export const connectProgressPct = (steps: ConnectStep[]) => {
  const req = steps.filter((s) => !s.optional);
  return Math.round((req.filter((s) => s.status === "done").length / req.length) * 100);
};

/**
 * Listing gate used by the eligibility function. `required` = the organisation started standalone and Kiorex has not approved it yet.
 * Existing organisations without a `kiorexConnect` document are legacy-connected and never gated.
 */
export function connectionGateFromSettings(providerSettings: unknown): { required: boolean; requested: boolean; paused: boolean } | undefined {
  const doc = (providerSettings as { kiorexConnect?: { status?: ConnectStatus } } | null | undefined)?.kiorexConnect;
  if (!doc?.status) return undefined;
  const st = doc.status;
  return { required: st !== "APPROVED", requested: st === "REQUESTED", paused: st === "PAUSED" };
}
