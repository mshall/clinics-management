import { DateTime } from "luxon";
import { Gender } from "@prisma/client";

/** Pure home-visit booking rules (HVBK/HVSAF03/HVFEE). No I/O, no flags. */

export type RuleResult<C extends string = string> = { ok: true } | { ok: false; code: C; message: string };

/** HVBK06 / BR60 — a clinician may restrict home visits to patients of one gender (own setting, never platform-imposed). */
export function checkGenderRestriction(restrictTo: Gender | null | undefined, patientGender: Gender): RuleResult<"HOME_VISIT_GENDER_RESTRICTED"> {
  if (!restrictTo || restrictTo === Gender.UNKNOWN || restrictTo === Gender.OTHER) return { ok: true };
  if (patientGender === restrictTo) return { ok: true };
  return { ok: false, code: "HOME_VISIT_GENDER_RESTRICTED", message: "This clinician does not take home visits for this patient" };
}

/**
 * HVSAF03 (BR51, BR54) — a FIRST home visit to a new patient needs a Kiorex-verified phone (Kiorex Passport phone OTP) or a deposit.
 * "New" = no earlier attended (checked-in / completed) home visit for this patient in this organization.
 */
export function checkFirstHomeVisit(input: {
  hasPriorAttendedHomeVisit: boolean;
  phoneVerifiedByKiorex: boolean;
  depositRequired: boolean;
}): RuleResult<"FIRST_HOME_VISIT_REQUIRES_VERIFIED_PHONE_OR_DEPOSIT"> {
  if (input.hasPriorAttendedHomeVisit || input.phoneVerifiedByKiorex || input.depositRequired) return { ok: true };
  return {
    ok: false,
    code: "FIRST_HOME_VISIT_REQUIRES_VERIFIED_PHONE_OR_DEPOSIT",
    message: "A first home visit needs a Kiorex-verified phone or a deposit",
  };
}

/** HVFEE01 / BR56 — the surcharge is its own line; it never enters the base fee that commission and revenue share are computed on. */
export function homeFeeBreakdown(baseFee: number, surcharge: number | null | undefined) {
  const s = surcharge != null && Number.isFinite(surcharge) && surcharge > 0 ? Math.round(surcharge * 100) / 100 : 0;
  const b = Math.round(baseFee * 100) / 100;
  return { baseFee: b, surcharge: s, total: Math.round((b + s) * 100) / 100 };
}

export type HomeHours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", Array<[string, string]>>>;

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function parseHomeHours(raw: unknown): HomeHours | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("homeHours must be an object keyed by mon..sun");
  const out: HomeHours = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(DAY_KEYS as readonly string[]).includes(k)) throw new Error(`homeHours: unknown day ${k}`);
    if (!Array.isArray(v)) throw new Error(`homeHours.${k} must be an array of [start,end]`);
    out[k as keyof HomeHours] = v.map((pair) => {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) {
        throw new Error(`homeHours.${k}: each range is ["HH:mm","HH:mm"]`);
      }
      if ((pair[0] as string) >= (pair[1] as string)) throw new Error(`homeHours.${k}: start must be before end`);
      return [pair[0] as string, pair[1] as string] as [string, string];
    });
  }
  return out;
}

/** True when [start,end) fits inside one of the clinician's home-visit ranges for that clinic-local day. `null` hours = no extra limit. */
export function withinHomeHours(hours: HomeHours | null, start: Date, end: Date, timezone: string): boolean {
  if (!hours) return true;
  const s = DateTime.fromJSDate(start, { zone: timezone });
  const e = DateTime.fromJSDate(end, { zone: timezone });
  if (s.toISODate() !== e.toISODate()) return false;
  const ranges = hours[DAY_KEYS[s.weekday - 1]!] ?? [];
  const sm = s.toFormat("HH:mm");
  const em = e.toFormat("HH:mm");
  return ranges.some(([a, b]) => sm >= a && em <= b);
}

/** HVCFG01 — default travel buffers for a HOME visit type when none are set (KX-05: 30 / 30 minutes). */
export const DEFAULT_HOME_TRAVEL_BUFFER_MIN = 30;

/** Great-circle distance in metres between two WGS84 points (haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h))));
}

export const DEFAULT_ARRIVAL_THRESHOLD_M = 500;

/** Off-site arrival threshold in metres (env HOME_VISIT_ARRIVAL_THRESHOLD_M, default 500; invalid/<=0 falls back to the default). */
export function arrivalThresholdM(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.HOME_VISIT_ARRIVAL_THRESHOLD_M);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ARRIVAL_THRESHOLD_M;
}

/** Non-blocking arrival check: distance (null when either side has no coordinates) and the off-site flag. */
export function arrivalCheck(fix: { lat?: number; lng?: number } | undefined, address: { lat?: number; lng?: number } | null | undefined, thresholdM = arrivalThresholdM()) {
  if (fix?.lat == null || fix?.lng == null || address?.lat == null || address?.lng == null) return { arrivalDistanceM: null as number | null, arrivedOffSite: false };
  const d = distanceMeters({ lat: fix.lat, lng: fix.lng }, { lat: address.lat, lng: address.lng });
  return { arrivalDistanceM: d as number | null, arrivedOffSite: d > thresholdM };
}
