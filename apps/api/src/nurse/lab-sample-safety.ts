import type { Gender } from "@prisma/client";

/**
 * KNLAB01 / KLORD05 — pure checks for a nurse-collected sample. ADR-025 safety control: NEVER switchable (no flag import or flag check may appear here; `lab-sample.node.test.ts` fails if one does). Wrong-patient and wrong-label errors are the classic lab harm,
 * so the checks run on every collection: >= 2 identifiers matched against the record, a real (not future) collection time, a sane
 * hand-over time, a valid and unique tube label, and the patient's consent.
 */
export const IDENTIFIER_KINDS = ["FULL_NAME", "DATE_OF_BIRTH", "PHONE"] as const;
export type IdentifierKind = (typeof IDENTIFIER_KINDS)[number];
/** The contract vocabulary of `LabOrderPlaced.identifiersChecked` (kiorex-contracts 1.6.0 = the Lab's identifier kinds, plus fullName for nurse intake). */
export const CONTRACT_IDENTIFIER_KIND: Record<IdentifierKind, "fullName" | "dateOfBirth" | "phone"> = { FULL_NAME: "fullName", DATE_OF_BIRTH: "dateOfBirth", PHONE: "phone" };
export type IdentifierInput = { kind: string; value: string };

export type LabSampleFailureCode =
  | "TWO_IDENTIFIERS_REQUIRED"
  | "IDENTIFIER_MISMATCH"
  | "IDENTIFIER_UNVERIFIABLE"
  | "COLLECTED_IN_FUTURE"
  | "COLLECTED_TIME_INVALID"
  | "HANDOVER_TIME_INVALID"
  | "TEMPERATURE_INVALID"
  | "TUBE_REQUIRED"
  | "TUBE_LABEL_INVALID"
  | "TUBE_LABEL_DUPLICATE"
  | "SPECIMEN_TYPE_REQUIRED";

export class LabSampleRuleError extends Error {
  constructor(
    public readonly code: LabSampleFailureCode,
    message: string,
    /** Only a identifier KIND may be echoed, never a value. */
    public readonly kind?: string,
  ) {
    super(message);
  }
}

/** Allowed clock skew between the nurse's phone and the server. */
export const FUTURE_TOLERANCE_MS = 60_000;
/** Contract tube-label pattern (kiorex-contracts 1.6.0): 3-40 printable ASCII characters. */
export const TUBE_LABEL_RE = /^[\x21-\x7e]{3,40}$/;
export const MAX_TUBES = 20;

const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const digits = (s: string) => s.replace(/\D/g, "");

export type PatientForCheck = { mrn: string; firstNameEn: string; lastNameEn: string; firstNameAr: string | null; lastNameAr: string | null; dob: Date | null; phone: string | null };

/** At least two DISTINCT supported kinds, each matching the patient record. Returns the kinds checked (never values). */
export function verifyIdentifiers(patient: PatientForCheck, given: IdentifierInput[] | undefined): string[] {
  const known = new Map<IdentifierKind, string>();
  for (const g of given ?? []) {
    const kind = String(g?.kind ?? "").toUpperCase() as IdentifierKind;
    if ((IDENTIFIER_KINDS as readonly string[]).includes(kind) && typeof g.value === "string" && g.value.trim()) known.set(kind, g.value);
  }
  if (known.size < 2) throw new LabSampleRuleError("TWO_IDENTIFIERS_REQUIRED", "Check at least two identifiers (e.g. full name and date of birth) before collecting");
  for (const [kind, value] of known) {
    const ok = matches(kind, value, patient);
    if (ok === null) throw new LabSampleRuleError("IDENTIFIER_UNVERIFIABLE", "The record has no value to check this identifier against", kind);
    if (!ok) throw new LabSampleRuleError("IDENTIFIER_MISMATCH", "The identifier does not match the patient record: do not collect, re-confirm the patient", kind);
  }
  return [...known.keys()].map((k) => CONTRACT_IDENTIFIER_KIND[k]);
}

function matches(kind: IdentifierKind, value: string, p: PatientForCheck): boolean | null {
  switch (kind) {
    case "FULL_NAME": {
      const names = [`${p.firstNameEn} ${p.lastNameEn}`, p.firstNameAr && p.lastNameAr ? `${p.firstNameAr} ${p.lastNameAr}` : null].filter((x): x is string => !!x);
      return names.some((n) => norm(n) === norm(value));
    }
    case "DATE_OF_BIRTH":
      return p.dob ? p.dob.toISOString().slice(0, 10) === value.trim().slice(0, 10) : null;
    case "PHONE": {
      const have = digits(p.phone ?? "");
      if (!have) return null;
      const got = digits(value);
      if (got.length < 6) return false;
      const n = Math.min(got.length, have.length, 11);
      return have.slice(-n) === got.slice(-n);
    }
  }
}

export function parseCollectedAt(v: string | undefined, now: Date): Date {
  if (v === undefined || v === "") return now;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new LabSampleRuleError("COLLECTED_TIME_INVALID", "collectedAt is not a valid time");
  if (d.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) throw new LabSampleRuleError("COLLECTED_IN_FUTURE", "The collection time cannot be in the future");
  return d;
}

/** Hand-over must fall between collection and now. */
export function parseHandedOverAt(v: string | undefined, collectedAt: Date, now: Date): Date | null {
  if (v === undefined || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime()) || d.getTime() < collectedAt.getTime() || d.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    throw new LabSampleRuleError("HANDOVER_TIME_INVALID", "The hand-over time must be between the collection time and now");
  }
  return d;
}

export function checkTemperature(v: number | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < -40 || v > 60) throw new LabSampleRuleError("TEMPERATURE_INVALID", "Transport temperature must be between -40 and 60 C");
  return Math.round(v * 10) / 10;
}

export type TubeInput = { label: string; specimenType: string; container?: string };

export function checkTubes(tubes: TubeInput[] | undefined): TubeInput[] {
  if (!Array.isArray(tubes) || tubes.length === 0) throw new LabSampleRuleError("TUBE_REQUIRED", "Record at least one tube label");
  if (tubes.length > MAX_TUBES) throw new LabSampleRuleError("TUBE_LABEL_INVALID", `At most ${MAX_TUBES} tubes per order`);
  const seen = new Set<string>();
  return tubes.map((t) => {
    const label = String(t?.label ?? "").trim();
    if (!TUBE_LABEL_RE.test(label)) throw new LabSampleRuleError("TUBE_LABEL_INVALID", "A tube label is 3-40 printable characters without spaces");
    if (seen.has(label.toUpperCase())) throw new LabSampleRuleError("TUBE_LABEL_DUPLICATE", "The same tube label was entered twice");
    seen.add(label.toUpperCase());
    const specimenType = String(t?.specimenType ?? "").trim();
    if (specimenType.length < 2 || specimenType.length > 60) throw new LabSampleRuleError("SPECIMEN_TYPE_REQUIRED", "Each tube needs a specimen type (e.g. BLOOD, URINE)");
    const container = t.container?.trim();
    return { label, specimenType, ...(container ? { container: container.slice(0, 60) } : {}) };
  });
}

export const GENDER_TO_SEX: Record<Gender, "M" | "F" | "OTHER" | "UNKNOWN"> = { M: "M", F: "F", OTHER: "OTHER", UNKNOWN: "UNKNOWN" };
