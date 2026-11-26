/**
 * SUB-01: pure subscription policy (no I/O). Everything here is config-driven from the market pack
 * (`Market.featureDefaults.kiorlyBilling.subscription`, written by the commercial-config bridge after a maker-checker approval).
 * No price, VAT or legal wording lives in this file: amounts come from PlanPrice, tax from `kiorlyBilling.taxRatePercent`.
 */
import { PlanKey, SubscriptionStatus } from "@prisma/client";
import { SUBSCRIPTION_POLICY_DEFAULTS } from "../markets/commercial-config.schema";

export type LapseAction = "DOWNGRADE_TO_LITE" | "READ_ONLY_SUSPEND";
export type ProrationTiming = "IMMEDIATE" | "PERIOD_END";

export type SubscriptionPolicy = {
  /** New paid subscriptions renew automatically unless the org turns it off. */
  autoRenewDefault: boolean;
  /** When false, org admins cannot switch auto-renew off (platform decides). */
  orgMayDisableAutoRenew: boolean;
  /** Days before currentPeriodEnd to remind the owner (descending). */
  renewalReminderDaysBefore: number[];
  /** What happens when dunning runs out. DOWNGRADE_TO_LITE is the founder default (never lockout). */
  lapseAction: LapseAction;
  /** Days after the oldest unpaid invoice's due date at which the tenant is moved to Lite. */
  downgradeAfterDays: number;
  /** Days the modules Lite does not include stay readable after a downgrade (data is never deleted). */
  liteReadOnlyGraceDays: number;
  /** Proration rules (values are NEEDS_HUMAN; these are engineering defaults). */
  proration: {
    upgradeTiming: ProrationTiming;
    downgradeTiming: ProrationTiming;
    creditUnusedOnDowngrade: boolean;
  };
  /** Hours (local) in which reminders must not be sent, `[start, end)` wrapping midnight. */
  reminderQuietHours: { start: number; end: number };
};

/** One source of truth: the market-pack schema defaults (`SUBSCRIPTION_POLICY_DEFAULTS`); values unchanged. */
export const DEFAULT_SUBSCRIPTION_POLICY: SubscriptionPolicy = {
  ...SUBSCRIPTION_POLICY_DEFAULTS,
  renewalReminderDaysBefore: [...SUBSCRIPTION_POLICY_DEFAULTS.renewalReminderDaysBefore],
  proration: { ...SUBSCRIPTION_POLICY_DEFAULTS.proration },
  reminderQuietHours: { ...SUBSCRIPTION_POLICY_DEFAULTS.reminderQuietHours },
};

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function int(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function timing(v: unknown, fallback: ProrationTiming): ProrationTiming {
  return v === "IMMEDIATE" || v === "PERIOD_END" ? v : fallback;
}

export function subscriptionPolicyFromFeatureDefaults(featureDefaults: unknown): SubscriptionPolicy {
  const d = DEFAULT_SUBSCRIPTION_POLICY;
  const row = rec(rec(rec(featureDefaults).kiorlyBilling).subscription);
  const reminders = Array.isArray(row.renewalReminderDaysBefore)
    ? [...new Set(row.renewalReminderDaysBefore.filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 90).map(Math.floor))].sort((a, b) => b - a)
    : [...d.renewalReminderDaysBefore];
  const proration = rec(row.proration);
  const quiet = rec(row.reminderQuietHours);
  return {
    autoRenewDefault: bool(row.autoRenewDefault, d.autoRenewDefault),
    orgMayDisableAutoRenew: bool(row.orgMayDisableAutoRenew, d.orgMayDisableAutoRenew),
    renewalReminderDaysBefore: reminders,
    lapseAction: row.lapseAction === "READ_ONLY_SUSPEND" ? "READ_ONLY_SUSPEND" : "DOWNGRADE_TO_LITE",
    downgradeAfterDays: int(row.downgradeAfterDays, d.downgradeAfterDays, 1, 365),
    liteReadOnlyGraceDays: int(row.liteReadOnlyGraceDays, d.liteReadOnlyGraceDays, 0, 365),
    proration: {
      upgradeTiming: timing(proration.upgradeTiming, d.proration.upgradeTiming),
      downgradeTiming: timing(proration.downgradeTiming, d.proration.downgradeTiming),
      creditUnusedOnDowngrade: bool(proration.creditUnusedOnDowngrade, d.proration.creditUnusedOnDowngrade),
    },
    reminderQuietHours: {
      start: int(quiet.start, d.reminderQuietHours.start, 0, 23),
      end: int(quiet.end, d.reminderQuietHours.end, 0, 23),
    },
  };
}

/** Platform force wins; otherwise the org's own switch. */
export function effectiveAutoRenew(sub: { autoRenew: boolean; autoRenewForced: string | null }): boolean {
  if (sub.autoRenewForced === "ON") return true;
  if (sub.autoRenewForced === "OFF") return false;
  return sub.autoRenew;
}

export const PAID_RENEWING_PLAN_KEYS: ReadonlySet<PlanKey> = new Set([
  PlanKey.PRO,
  PlanKey.CLINIC,
  PlanKey.ENTERPRISE,
  PlanKey.NURSE_PRO,
  PlanKey.NURSE_AGENCY,
]);

/** Lite is the free floor; Nurse Lite is the Nurse edition's free floor. */
export function liteKeyForPlan(planKey: PlanKey): PlanKey {
  return planKey === PlanKey.NURSE_PRO || planKey === PlanKey.NURSE_AGENCY || planKey === PlanKey.NURSE_LITE
    ? PlanKey.NURSE_LITE
    : PlanKey.LITE;
}

export function isFreeFloorPlan(planKey: PlanKey): boolean {
  return planKey === PlanKey.LITE || planKey === PlanKey.NURSE_LITE;
}

export type PeriodEndDecision = "RENEW" | "DOWNGRADE_AUTO_RENEW_OFF" | "NONE";

/**
 * What to do when `currentPeriodEnd <= now` for a subscription.
 * - Free floor plans and trialling / lapsed statuses are not handled here (trial engine and dunning own those).
 * - A paid plan with auto-renew off (or a scheduled cancel) moves to Lite at the period end, never to CANCELLED.
 */
export function decidePeriodEnd(input: {
  status: SubscriptionStatus;
  planKey: PlanKey;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  now: Date;
}): PeriodEndDecision {
  if (input.currentPeriodEnd > input.now) return "NONE";
  if (isFreeFloorPlan(input.planKey)) return input.status === SubscriptionStatus.ACTIVE ? "RENEW" : "NONE";
  if (input.status !== SubscriptionStatus.ACTIVE) return "NONE";
  if (!input.autoRenew || input.cancelAtPeriodEnd) return "DOWNGRADE_AUTO_RENEW_OFF";
  return "RENEW";
}

const MS_DAY = 86_400_000;

/** Reminder offsets (days before period end) that are due now and not yet sent for this period. */
export function reminderOffsetsDue(input: {
  currentPeriodEnd: Date;
  now: Date;
  offsets: readonly number[];
  alreadySent: readonly number[];
}): number[] {
  if (input.currentPeriodEnd <= input.now) return [];
  const daysLeft = Math.ceil((input.currentPeriodEnd.getTime() - input.now.getTime()) / MS_DAY);
  // Only the tightest due offset fires per run, so a tenant that missed earlier runs gets one message, not three.
  // A tighter offset already sent supersedes the looser ones (never send "7 days" after "3 days" went out).
  const tightestSent = input.alreadySent.length ? Math.min(...input.alreadySent) : Number.POSITIVE_INFINITY;
  const due = input.offsets.filter((o) => daysLeft <= o && !input.alreadySent.includes(o) && o < tightestSent);
  if (due.length === 0) return [];
  return [Math.min(...due)];
}

/** Next instant at or after `now` whose local hour is outside quiet hours (offset in whole hours from UTC). */
export function nextOutsideQuietHours(now: Date, quiet: { start: number; end: number }, tzOffsetHours: number): Date {
  const inQuiet = (d: Date) => {
    const h = (((d.getUTCHours() + tzOffsetHours) % 24) + 24) % 24;
    const { start, end } = quiet;
    if (start === end) return false;
    return start < end ? h >= start && h < end : h >= start || h < end;
  };
  let d = new Date(now);
  for (let i = 0; i < 25 && inQuiet(d); i++) d = new Date(d.getTime() + 3_600_000);
  return d;
}

export type EntitlementMap = Record<string, boolean | number | Record<string, unknown>>;

export type DowngradeImpact = {
  fromPlanKey: PlanKey;
  toPlanKey: PlanKey;
  /** Features the tenant has today that the target plan does not include (data kept, access changes). */
  lostFeatures: string[];
  /** Numeric limits that shrink, with current usage so the UI can show "you have 7, Lite allows 2". */
  reducedLimits: { key: string; from: number | null; to: number | null; current: number | null; overBy: number }[];
  /** Always true: nothing is deleted on downgrade. */
  dataRetained: true;
  /** Days the lost modules stay readable (policy). */
  readOnlyGraceDays: number;
  /** After the grace, lost modules need an upgrade; data is still stored and returns on upgrade. */
  restoredOnUpgrade: true;
};

const LIMIT_KEYS = ["max_clinicians", "max_branches", "max_assistant_seats"];

function truthy(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v != null;
}
function limitOf(v: unknown): number | null {
  if (typeof v === "number") return v < 0 ? null : v;
  if (typeof v === "boolean") return v ? null : 0;
  return null;
}

export function computeDowngradeImpact(input: {
  fromPlanKey: PlanKey;
  toPlanKey: PlanKey;
  from: EntitlementMap;
  to: EntitlementMap;
  usage: Record<string, number>;
  readOnlyGraceDays: number;
}): DowngradeImpact {
  const lostFeatures: string[] = [];
  const reducedLimits: DowngradeImpact["reducedLimits"] = [];
  for (const key of Object.keys(input.from).sort()) {
    if (LIMIT_KEYS.includes(key)) continue;
    if (truthy(input.from[key]) && !truthy(input.to[key])) lostFeatures.push(key);
  }
  for (const key of LIMIT_KEYS) {
    const from = limitOf(input.from[key]);
    const to = limitOf(input.to[key]);
    const shrinks = to != null && (from == null || to < from);
    if (!shrinks) continue;
    const current = input.usage[key] ?? null;
    reducedLimits.push({ key, from, to, current, overBy: current != null && to != null ? Math.max(0, current - to) : 0 });
  }
  return {
    fromPlanKey: input.fromPlanKey,
    toPlanKey: input.toPlanKey,
    lostFeatures,
    reducedLimits,
    dataRetained: true,
    readOnlyGraceDays: input.readOnlyGraceDays,
    restoredOnUpgrade: true,
  };
}

/** The Lite read-only window: lost `mod_*` modules stay GET-able until `liteReadOnlyGraceUntil`. */
export function liteGraceActive(sub: { liteReadOnlyGraceUntil: Date | null; downgradedToLiteAt: Date | null }, now: Date): boolean {
  return sub.downgradedToLiteAt != null && sub.liteReadOnlyGraceUntil != null && sub.liteReadOnlyGraceUntil > now;
}
