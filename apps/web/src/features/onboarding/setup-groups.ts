import type { OnboardingStepDto, OnboardingStepKey } from "../../lib/onboarding-api";

/**
 * Logical phases for Welcome — quick setup.
 * Required journey first; every optional step lives in the final `optional` phase.
 */
export type SetupGroupId = "clinic" | "team" | "golive" | "nurse" | "optional";

export type SetupGroupDef = {
  id: SetupGroupId;
  keys: readonly OnboardingStepKey[];
};

export const SETUP_GROUPS: readonly SetupGroupDef[] = [
  {
    id: "clinic",
    keys: ["clinic_profile", "working_hours", "appointment_types"],
  },
  {
    id: "team",
    keys: ["doctor_availability"],
  },
  {
    id: "golive",
    keys: ["first_appointment", "first_check_in"],
  },
  {
    id: "nurse",
    keys: [
      "nurse_verification",
      "nurse_zones",
      "nurse_services",
      "nurse_prices",
      "nurse_availability",
      "nurse_safety_contact",
    ],
  },
  {
    id: "optional",
    keys: [
      "clinic_logo",
      "invite_receptionist",
      "whatsapp_reminders",
      "import_patients",
      "doctor_verification",
      "kiorex_profile",
      "connect_kiorex",
      "growth_links",
    ],
  },
] as const;

const KEY_TO_GROUP = new Map<OnboardingStepKey, SetupGroupId>();
for (const g of SETUP_GROUPS) {
  for (const k of g.keys) KEY_TO_GROUP.set(k, g.id);
}

export function setupGroupForStep(key: OnboardingStepKey): SetupGroupId {
  if (KEY_TO_GROUP.has(key)) return KEY_TO_GROUP.get(key)!;
  if (key.startsWith("nurse_")) return "nurse";
  // Unknown optional-looking keys still land in the optional phase at the end.
  return "optional";
}

export type SetupGroupBucket = {
  id: SetupGroupId;
  steps: OnboardingStepDto[];
  done: number;
  total: number;
  pending: number;
  complete: boolean;
  hasNext: boolean;
  /** Last phase — optional extras (skip-friendly). */
  optional: boolean;
};

/** Bucket visible steps into phases; empty groups are omitted. */
export function groupSetupSteps(
  steps: OnboardingStepDto[],
  nextKey: OnboardingStepKey | null,
): SetupGroupBucket[] {
  const byId = new Map<SetupGroupId, OnboardingStepDto[]>();
  for (const g of SETUP_GROUPS) byId.set(g.id, []);

  for (const step of steps) {
    const id = setupGroupForStep(step.key);
    const list = byId.get(id) ?? [];
    list.push(step);
    byId.set(id, list);
  }

  // Keep catalogue order within each phase (SETUP_GROUPS key order), not API arrival order.
  const out: SetupGroupBucket[] = [];
  for (const g of SETUP_GROUPS) {
    const raw = byId.get(g.id) ?? [];
    if (raw.length === 0) continue;
    const byKey = new Map(raw.map((s) => [s.key, s]));
    const list = g.keys.map((k) => byKey.get(k)).filter((s): s is OnboardingStepDto => Boolean(s));
    // Any unexpected keys mapped into this group (fallback path)
    for (const s of raw) if (!list.includes(s)) list.push(s);

    const available = list.filter((s) => s.available);
    const pool = available.length ? available : list;
    const done = pool.filter((s) => s.status === "done" || s.status === "skipped").length;
    const pending = pool.filter((s) => s.status === "pending").length;
    out.push({
      id: g.id,
      steps: list,
      done,
      total: pool.length,
      pending,
      complete: pending === 0 && pool.length > 0,
      hasNext: Boolean(nextKey && list.some((s) => s.key === nextKey)),
      optional: g.id === "optional",
    });
  }
  return out;
}

/** Flatten phases for the sequential wizard so optional steps come last. */
export function orderedSetupSteps(steps: OnboardingStepDto[]): OnboardingStepDto[] {
  return groupSetupSteps(steps, null).flatMap((g) => g.steps.filter((s) => s.available));
}

/** Index of the phase that should be shown: first incomplete, else last. */
export function defaultGroupIndex(groups: SetupGroupBucket[]): number {
  const next = groups.findIndex((g) => g.hasNext);
  if (next >= 0) return next;
  const incomplete = groups.findIndex((g) => !g.complete);
  if (incomplete >= 0) return incomplete;
  return Math.max(0, groups.length - 1);
}
