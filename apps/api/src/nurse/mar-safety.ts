import { PatientAllergyCode } from "@prisma/client";
import { allergyMatchesIngredients } from "../clinical/allergy-ingredient-map";

/**
 * KNMAR01-03 / BR57 — pure MAR safety checks. ADR-025 safety control: NEVER a feature flag (this file and the administration service
 * are on the `mar_safety_checks` safety path; `ff-safety-never-flags.node.test.ts` fails if flag gating appears here).
 * No order, no administration: every entry is checked against a doctor's order, the patient's allergies and recent administrations.
 */
export type OrderLine = { medicineName: string; dose?: string; route?: string; frequency?: string; minIntervalMinutes?: number; ingredientNames?: string[] };

export type OrderForCheck = {
  id: string;
  patientId: string;
  status: string; // ACTIVE | REVOKED
  expiresOn: Date;
  controlled: boolean;
  lines: OrderLine[];
};

export type EntryForCheck = {
  patientId: string;
  medicineName: string;
  dose: string;
  route: string;
  administeredAt: Date;
  witnessUserId?: string | null;
  witnessName?: string | null;
  /** Generic / ingredient names for the allergy check (from the drug database when a product is picked, else the medicine name). */
  ingredientNames?: string[];
};

export type RecentAdministration = { medicineName: string; administeredAt: Date; doctorOrderId: string };
export type AllergyRow = { code: PatientAllergyCode; otherComment: string | null };

export type MarFailureCode =
  | "DOCTOR_ORDER_REQUIRED"
  | "ORDER_PATIENT_MISMATCH"
  | "ORDER_REVOKED"
  | "ORDER_EXPIRED"
  | "MEDICINE_NOT_IN_ORDER"
  | "ALLERGY_CONFLICT"
  | "DUPLICATE_ADMINISTRATION"
  | "CONTROLLED_REQUIRES_CONTROLLED_ORDER"
  | "CONTROLLED_REQUIRES_WITNESS";

export type MarCheck = { ok: true; matchedLine: OrderLine; checks: Record<string, "PASSED" | "NOT_APPLICABLE"> } | { ok: false; code: MarFailureCode; message: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const DEFAULT_MIN_INTERVAL_MIN = 60;

/** Does a free-text medicine name match an order line? Exact (case/space-insensitive) or one contains the other (brand + strength vs generic). */
export function medicineMatchesLine(name: string, line: OrderLine): boolean {
  const a = norm(name);
  const b = norm(line.medicineName);
  return a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b));
}

export function evaluateAdministration(input: {
  order: OrderForCheck | null | undefined;
  entry: EntryForCheck;
  allergies: AllergyRow[];
  recent: RecentAdministration[];
  /** Calendar day of the administration, local to the clinic (orders expire at the end of `expiresOn`). */
  now?: Date;
}): MarCheck {
  const { order, entry } = input;
  if (!order) return { ok: false, code: "DOCTOR_ORDER_REQUIRED", message: "A doctor's order is required to record a medication administration" };
  if (order.patientId !== entry.patientId) return { ok: false, code: "ORDER_PATIENT_MISMATCH", message: "The order belongs to another patient" };
  if (order.status !== "ACTIVE") return { ok: false, code: "ORDER_REVOKED", message: "The doctor's order is no longer active" };
  const endOfExpiry = new Date(order.expiresOn.getTime() + 24 * 3600_000 - 1);
  if (entry.administeredAt.getTime() > endOfExpiry.getTime()) return { ok: false, code: "ORDER_EXPIRED", message: "The doctor's order has expired" };

  const line = order.lines.find((l) => medicineMatchesLine(entry.medicineName, l));
  if (!line) return { ok: false, code: "MEDICINE_NOT_IN_ORDER", message: "This medicine is not on the doctor's order" };

  // BR35: controlled medicines only against an order marked controlled, with a witness.
  const controlledEntry = order.controlled;
  if (controlledEntry && !(entry.witnessUserId || entry.witnessName?.trim())) {
    return { ok: false, code: "CONTROLLED_REQUIRES_WITNESS", message: "A witness is required for a controlled medicine" };
  }

  // Allergy check (CL02 data reused): every entry, never skippable.
  const ingredients = [...(entry.ingredientNames ?? []), ...(line.ingredientNames ?? []), entry.medicineName, line.medicineName];
  const hit = input.allergies.find((a) => allergyMatchesIngredients(a.code, ingredients, a.otherComment));
  if (hit) return { ok: false, code: "ALLERGY_CONFLICT", message: `Recorded allergy (${hit.code}) matches this medicine` };

  // Duplicate check: the same medicine given again inside the minimum interval (per order line, default 60 min).
  const minMs = (line.minIntervalMinutes ?? DEFAULT_MIN_INTERVAL_MIN) * 60_000;
  const dup = input.recent.find((r) => medicineMatchesLine(r.medicineName, line) && Math.abs(entry.administeredAt.getTime() - r.administeredAt.getTime()) < minMs);
  if (dup) return { ok: false, code: "DUPLICATE_ADMINISTRATION", message: "This medicine was already administered within the minimum interval" };

  return { ok: true, matchedLine: line, checks: { doctorOrder: "PASSED", orderActive: "PASSED", orderNotExpired: "PASSED", allergy: "PASSED", duplicate: "PASSED", witness: controlledEntry ? "PASSED" : "NOT_APPLICABLE" } };
}

/** KNMAR02 — a photo-uploaded order needs the nurse's confirmation of prescriber name and date, plus an expiry (Q10 default). */
export function validatePhotoOrderConfirmation(i: { prescriberName?: string; orderedOn?: string; expiresOn?: string; lines?: OrderLine[] }): string | null {
  if (!i.prescriberName?.trim()) return "prescriberName is required";
  if (!i.orderedOn || Number.isNaN(Date.parse(i.orderedOn))) return "orderedOn (date on the order) is required";
  if (!i.expiresOn || Number.isNaN(Date.parse(i.expiresOn))) return "expiresOn is required";
  if (Date.parse(i.expiresOn) < Date.parse(i.orderedOn)) return "expiresOn must not be before orderedOn";
  if (!i.lines?.length || i.lines.some((l) => !l.medicineName?.trim())) return "at least one order line with a medicine is required";
  return null;
}
