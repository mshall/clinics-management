import { Profession, VerificationStatus } from "@prisma/client";
import { isListableProfession, type ProfessionPack, type RegisterRule } from "../scope-of-practice/profession-pack";

/**
 * PRVER01-04 pure rules (KX-05 Rev 2.3 §06). No flags (ADR-025): profession verification before listing is a safety
 * control. Everything here is data-driven from the market's profession pack.
 */

export type VerificationBadge = {
  profession: Profession | null;
  verified: boolean;
  labelEn: string;
  labelAr: string;
};

export const REVERIFY_REASONS = ["NAME_CHANGED", "PROFESSION_CHANGED", "SPECIALTY_CHANGED", "LICENCE_EXPIRED", "INTERVAL_ELAPSED"] as const;
export type ReverifyReason = (typeof REVERIFY_REASONS)[number];

/** PRVER02 — the badge names the profession ("Verified physiotherapist"). */
export function verificationBadge(
  pack: ProfessionPack,
  profession: Profession | null | undefined,
  status: VerificationStatus | null | undefined,
): VerificationBadge {
  if (!profession) return { profession: null, verified: false, labelEn: "Not verified", labelAr: "غير موثّق" };
  const rule = pack.verification[profession];
  if (status === VerificationStatus.VERIFIED && rule.verifiable) {
    return { profession, verified: true, labelEn: rule.badgeEn, labelAr: rule.badgeAr };
  }
  return { profession, verified: false, labelEn: `${rule.labelEn} (not verified)`, labelAr: `${rule.labelAr} (غير موثّق)` };
}

/**
 * Listing gate: a LIVE listing needs VERIFIED *for the clinician's current profession*. A record verified for another
 * profession (or for an unlicensed ASSISTANT) never counts. Records verified before PRSOP01 (verifiedProfession NULL)
 * count for the user's current profession until the next re-verification (expand phase).
 */
export function effectiveVerificationStatus(
  row: { status: VerificationStatus; verifiedProfession: Profession | null } | null | undefined,
  currentProfession: Profession | null,
  pack: ProfessionPack,
): VerificationStatus | null {
  if (!row) return null;
  if (row.status !== VerificationStatus.VERIFIED) return row.status;
  if (!isListableProfession(pack, currentProfession)) return VerificationStatus.PENDING;
  if (row.verifiedProfession && row.verifiedProfession !== currentProfession) return VerificationStatus.PENDING;
  return VerificationStatus.VERIFIED;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

/** PRVER03 — next re-verification: the earlier of the pack interval and the earliest licence expiry. */
export function computeNextReverifyAt(pack: ProfessionPack, verifiedAt: Date, licenceExpiries: (Date | null | undefined)[]): Date {
  let next = addMonths(verifiedAt, pack.reverification.intervalMonths);
  for (const e of licenceExpiries) if (e && e.getTime() < next.getTime()) next = e;
  return next;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * PRVER03 — expiry reminders. `reminderDays` e.g. [60, 30, 7] => 3 stages. Returns the highest stage now due that is
 * greater than `currentStage` (1-based), or null when nothing new is due. Stage 0 = none sent.
 */
export function dueReminderStage(
  pack: ProfessionPack,
  nextReverifyAt: Date,
  now: Date,
  currentStage: number,
): { stage: number; daysLeft: number } | null {
  const days = [...pack.reverification.reminderDays].sort((a, b) => b - a);
  const daysLeft = Math.ceil((nextReverifyAt.getTime() - now.getTime()) / DAY_MS);
  let stage = 0;
  days.forEach((d, i) => {
    if (daysLeft <= d) stage = i + 1;
  });
  return stage > currentStage ? { stage, daysLeft } : null;
}

export function isReverificationOverdue(nextReverifyAt: Date | null | undefined, now: Date): boolean {
  return nextReverifyAt != null && nextReverifyAt.getTime() <= now.getTime();
}

/** Validate a registration number against the register's format (null format = free text). */
export function registrationNumberValid(rule: RegisterRule, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (!rule.numberFormat) return v.length <= 64;
  return new RegExp(rule.numberFormat).test(v);
}

/** Change detection for hazard H11: which edits force re-verification. */
export function reverifyReasonForChange(prev: { name: string; profession: Profession | null; specialty: string | null }, next: { name: string; profession: Profession | null; specialty: string | null }): ReverifyReason | null {
  if (prev.profession !== next.profession) return "PROFESSION_CHANGED";
  if (prev.name.trim() !== next.name.trim()) return "NAME_CHANGED";
  if ((prev.specialty ?? "") !== (next.specialty ?? "")) return "SPECIALTY_CHANGED";
  return null;
}
