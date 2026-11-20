import { BadRequestException } from "@nestjs/common";

/**
 * CL07-PT pure rules (KX-05 Rev 2.3 §07). The pack is a paid add-on (entitlement `pack_physio`) behind the launch-locked
 * flag `clinic.specialty_templates.physio` (gate GPR2: NEEDS_HUMAN, never recorded by code).
 */
export const PHYSIO_TEMPLATE_FLAG_CODE = "physio";
export const PHYSIO_ENTITLEMENT = "pack_physio";
export const PHYSIO_HEP_TEMPLATE_KEY = "physio_hep_link";
export const PHYSIO_HEP_TTL_DAYS = 90;

export const PHYSIO_REFERRAL_SOURCES = ["ATTACHED_DOCUMENT", "KIORLY_REFERRAL", "DIRECT_ACCESS"] as const;
export const OUTCOME_KINDS = ["PAIN_NRS", "ROM", "STRENGTH", "FUNCTION"] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export type OutcomePoint = { kind: OutcomeKind; label: string; side?: string | null; value: number; unit: string };

function bad(msg: string): never {
  throw new BadRequestException(msg);
}

export function assertPain(n: unknown, field = "painNrs"): number {
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 10) bad(`${field} must be an integer 0-10`);
  return n;
}

export type RomEntry = { joint: string; side?: string; movement: string; degrees: number };
export type StrengthEntry = { muscleGroup: string; side?: string; grade: number };

export function validateAssessment(b: {
  complaint?: string;
  painNrs?: unknown;
  rom?: RomEntry[];
  strength?: StrengthEntry[];
  specialTests?: { name: string; side?: string; result: string }[];
  functionalGoals?: { text: string }[];
}) {
  if (!b.complaint?.trim()) bad("complaint is required");
  const pain = assertPain(b.painNrs);
  for (const r of b.rom ?? []) {
    if (!r.joint?.trim() || !r.movement?.trim()) bad("each ROM entry needs joint and movement");
    if (typeof r.degrees !== "number" || r.degrees < 0 || r.degrees > 360) bad("ROM degrees must be 0-360");
  }
  for (const s of b.strength ?? []) {
    if (!s.muscleGroup?.trim()) bad("each strength entry needs a muscle group");
    if (!Number.isInteger(s.grade) || s.grade < 0 || s.grade > 5) bad("strength grade must be an integer 0-5 (MRC)");
  }
  for (const t of b.specialTests ?? []) {
    if (!t.name?.trim() || !["POSITIVE", "NEGATIVE", "EQUIVOCAL"].includes(t.result)) bad("special test needs a name and POSITIVE/NEGATIVE/EQUIVOCAL");
  }
  if (!(b.functionalGoals ?? []).length) bad("at least one functional goal is required");
  return pain;
}

/** Baseline outcome points derived from an assessment (so trend charts start at the first visit). */
export function baselinePoints(a: { painNrs: number; rom?: RomEntry[]; strength?: StrengthEntry[] }): OutcomePoint[] {
  return [
    { kind: "PAIN_NRS", label: "pain", value: a.painNrs, unit: "0-10" },
    ...(a.rom ?? []).map((r): OutcomePoint => ({ kind: "ROM", label: `${r.joint}_${r.movement}`.toLowerCase(), side: r.side ?? null, value: r.degrees, unit: "deg" })),
    ...(a.strength ?? []).map((s): OutcomePoint => ({ kind: "STRENGTH", label: s.muscleGroup.toLowerCase(), side: s.side ?? null, value: s.grade, unit: "MRC 0-5" })),
  ];
}

export function validateOutcomePoints(points: OutcomePoint[] | undefined): OutcomePoint[] {
  const out: OutcomePoint[] = [];
  for (const p of points ?? []) {
    if (!(OUTCOME_KINDS as readonly string[]).includes(p.kind)) bad(`unknown outcome kind ${p.kind}`);
    if (!p.label?.trim() || !p.unit?.trim() || typeof p.value !== "number" || !Number.isFinite(p.value)) bad("outcome needs label, unit and numeric value");
    if (p.kind === "PAIN_NRS") assertPain(p.value, "pain value");
    if (p.kind === "STRENGTH" && (p.value < 0 || p.value > 5)) bad("strength grade must be 0-5");
    out.push(p);
  }
  return out;
}

export type TrendPoint = { at: string; value: number };
export function buildTrend(rows: { measuredAt: Date; value: unknown }[]): { points: TrendPoint[]; first: number | null; latest: number | null; change: number | null } {
  const points = rows
    .map((r) => ({ at: r.measuredAt.toISOString(), value: Number(r.value) }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const first = points[0]?.value ?? null;
  const latest = points.length ? points[points.length - 1]!.value : null;
  return { points, first, latest, change: first != null && latest != null ? Math.round((latest - first) * 100) / 100 : null };
}

export type Exercise = { nameEn: string; nameAr: string; sets?: number; reps?: number; holdSeconds?: number; notesEn?: string; notesAr?: string };

export function validateExercises(list: Exercise[] | undefined): Exercise[] {
  if (!list?.length) bad("a home exercise programme needs at least one exercise");
  if (list.length > 30) bad("at most 30 exercises");
  for (const e of list) {
    if (!e.nameEn?.trim() || !e.nameAr?.trim()) bad("each exercise needs an English and an Arabic name");
    for (const k of ["sets", "reps", "holdSeconds"] as const) {
      const v = e[k];
      if (v != null && (!Number.isInteger(v) || v < 1 || v > 1000)) bad(`${k} must be a positive integer`);
    }
  }
  return list;
}

/** Direct access without a referral only where the market pack allows it (open question Q9; default NOT allowed). */
export function directAccessAllowed(clinicalConfig: unknown): boolean {
  const cfg = clinicalConfig && typeof clinicalConfig === "object" && !Array.isArray(clinicalConfig) ? (clinicalConfig as Record<string, unknown>) : {};
  return cfg.physioDirectAccess === true;
}
