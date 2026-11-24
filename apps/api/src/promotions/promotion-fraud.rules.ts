/**
 * GRW-P2-S fraud rules (PURE), rule ids as in the work package. Each rule returns a signal or null; the service decides what to do with it from the policy:
 * `fraudEnforce` lists the rules that hold (enforce), everything else is shadow (recorded in the promotion audit and reported to Kiorex, nothing blocked), like AD-11.
 * A reservation that already exists is never silently reduced: a hold goes to review, the patient's discount stays.
 */
export type PromotionFraudRule = "PF_SELF_DEAL" | "PF_FARM" | "PF_PRICE_INFLATION" | "PF_NO_ATTENDANCE" | "PF_VELOCITY" | "PF_COLLUSION_LOOP" | "PF_CLINICAL_INDUCEMENT";
export interface FraudSignal { rule: PromotionFraudRule; score: number; detail: string }

const norm = (p: string | null | undefined) => (p ?? "").replace(/[^\d+]/g, "").replace(/^00/, "+").replace(/^0(?=\d{9,10}$)/, "+20");
const digits = (p: string) => p.replace(/\D/g, "").slice(-10);

/** PF_SELF_DEAL: the patient's phone equals a staff or owner phone of the clinic (compared inside the Clinic, normalised to the last 10 digits). */
export function selfDeal(patientPhone: string | null | undefined, staffPhones: readonly (string | null | undefined)[], weight = 90): FraudSignal | null {
  const p = digits(norm(patientPhone)); if (p.length < 8) return null;
  return staffPhones.some((s) => digits(norm(s)) === p) ? { rule: "PF_SELF_DEAL", score: weight, detail: "PATIENT_PHONE_IS_STAFF_PHONE" } : null;
}

/** PF_FARM: one patientRef (or one patient identity) tries many first-booking reservations in a short window. */
export function farm(i: { reservationsByPatientInWindow: number; distinctPromotions: number; threshold?: number }, weight = 60): FraudSignal | null {
  const t = i.threshold ?? 3; return i.reservationsByPatientInWindow >= t ? { rule: "PF_FARM", score: weight, detail: `REPEAT_RESERVATIONS:${i.reservationsByPatientInWindow}/${i.distinctPromotions}` } : null;
}

/** PF_PRICE_INFLATION: the visit fee (or deposit) was raised by more than `bp` over the reference price within the window before or during the promotion. */
export function priceInflation(i: { referencePriceMinor: number; currentPriceMinor: number; maxPriceInWindowMinor: number; bp: number }, weight = 70): FraudSignal | null {
  if (i.referencePriceMinor <= 0) return null;
  const peak = Math.max(i.currentPriceMinor, i.maxPriceInWindowMinor);
  return (peak - i.referencePriceMinor) * 10_000 > i.referencePriceMinor * i.bp ? { rule: "PF_PRICE_INFLATION", score: weight, detail: `PRICE_UP:${i.referencePriceMinor}->${peak}` } : null;
}

/** PF_NO_ATTENDANCE: a debit is only legal with attendance evidence (a check-in time, and the visit COMPLETED or confirmed 24 h after check-in). */
export function noAttendance(i: { checkedInAt: Date | null; status: string; hoursSinceCheckIn: number | null }, weight = 100): FraudSignal | null {
  if (!i.checkedInAt) return { rule: "PF_NO_ATTENDANCE", score: weight, detail: "NO_CHECK_IN" };
  if (i.status === "COMPLETED") return null;
  if (i.status === "CHECKED_IN" && (i.hoursSinceCheckIn ?? 0) >= 24) return null;
  return { rule: "PF_NO_ATTENDANCE", score: weight, detail: `STATUS_${i.status}` };
}

/** PF_VELOCITY: spend rate beyond a multiple of the plan (cap spread evenly over the window). */
export function velocity(i: { burnRatio: number; multiple?: number }, weight = 40): FraudSignal | null {
  const m = i.multiple ?? 3; return i.burnRatio >= m ? { rule: "PF_VELOCITY", score: weight, detail: `BURN_${i.burnRatio.toFixed(1)}X` } : null;
}

/** PF_COLLUSION_LOOP: the same patientRef is the beneficiary of promotions of several clinics of related owners (computed on the Kiorex side, which sees all clinics; here for the shared vector test). */
export function collusionLoop(i: { patientRefReuseAcrossClinics: number; relatedOwners: boolean; threshold?: number }, weight = 60): FraudSignal | null {
  return i.relatedOwners && i.patientRefReuseAcrossClinics >= (i.threshold ?? 3) ? { rule: "PF_COLLUSION_LOOP", score: weight, detail: `REUSE:${i.patientRefReuseAcrossClinics}` } : null;
}

export const clinicalInducement = (guardSignal: string | null, weight = 80): FraudSignal | null => (guardSignal === "PF_CLINICAL_INDUCEMENT" ? { rule: "PF_CLINICAL_INDUCEMENT", score: weight, detail: "COPY_OR_SCOPE_KEYWORDS" } : null);

export const holds = (s: FraudSignal | null, enforce: readonly string[]): boolean => !!s && enforce.includes(s.rule);
