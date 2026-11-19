import { Profession } from "@prisma/client";
import { SCOPE_CAPABILITIES, isScopeCapability, type ScopeCapability } from "./scope-capabilities";

/**
 * PRSOP02 / PRVER01 — per-market profession pack: the scope-of-practice matrix (versioned, CMO-signed) and the
 * verification rule per profession. Stored as market-pack data in `Market.clinicalConfig.professionPack`; the
 * shipped defaults below apply when a market has not overridden them.
 */
export const PROFESSIONS = [
  Profession.PHYSICIAN,
  Profession.DENTIST,
  Profession.PHYSIOTHERAPIST,
  Profession.NURSE,
  Profession.ASSISTANT,
] as const;

export type RegisterRule = {
  code: string;
  labelEn: string;
  labelAr: string;
  /** Regex source for the registration number; null = free text (format confirmed by ops, NEEDS_HUMAN). */
  numberFormat: string | null;
  required: boolean;
  /** Review-checklist key an ops reviewer must tick for this register. */
  checklistKey: string;
  /** True for the register whose number is the legacy `ClinicianVerification.syndicateNumber`. */
  isSyndicate?: boolean;
  /** True when the register carries an expiry date (licence) that drives re-verification reminders. */
  hasExpiry?: boolean;
};

export type ProfessionVerificationRule = {
  /** False for unlicensed assistants (never verified, never listed). */
  verifiable: boolean;
  registers: RegisterRule[];
  /** Document kinds required before a submission is accepted. */
  requiredDocuments: string[];
  /** Extra checklist keys beyond the register checklist keys (ops queue, PRVER02). */
  extraChecklist: string[];
  /** PRVER04 — extra documents / checklist keys when the clinician practises solo. */
  soloExtraDocuments: string[];
  soloExtraChecklist: string[];
  badgeEn: string;
  badgeAr: string;
  labelEn: string;
  labelAr: string;
};

export type ProfessionPack = {
  schemaVersion: 1;
  marketCode: string;
  /** Scope matrix version (bump on every change; CMO signs each version). */
  scopeVersion: string;
  /** CMO sign-off record. NEEDS_HUMAN: never set by code or migration — `null` until a named CMO signs. */
  cmoSignOff: { by: string; at: string } | null;
  scope: Record<Profession, ScopeCapability[]>;
  verification: Record<Profession, ProfessionVerificationRule>;
  reverification: {
    /** Re-verify at least this often even without a licence expiry. */
    intervalMonths: number;
    /** Reminder offsets in days before expiry (descending). */
    reminderDays: number[];
  };
};

const LICENSED_ALL: ScopeCapability[] = ["practice.core", "vitals.record", "outcome_measures.record", "sessions.record", "assistant.supervise", "encounter.sign"];

const BASE_CHECKLIST = ["documents_readable"] as const;

function reg(partial: Pick<RegisterRule, "code" | "labelEn" | "labelAr" | "checklistKey"> & Partial<RegisterRule>): RegisterRule {
  return { numberFormat: null, required: true, ...partial };
}

const SYNDICATE_NUMBER_FORMAT = "^[A-Za-z0-9][A-Za-z0-9\\-\\/]{2,31}$";

/** Egypt baseline (KX-05 Rev 2.3 §06). Number formats are generic until Ops confirm the register formats. */
export const EG_PROFESSION_PACK: ProfessionPack = {
  schemaVersion: 1,
  marketCode: "EG",
  scopeVersion: "2026-11-20.1",
  cmoSignOff: null,
  scope: {
    PHYSICIAN: [...LICENSED_ALL, "encounter.template.soap", "rx.prescribe", "orders.lab_radiology", "mar.administer", "home_visits.perform"],
    DENTIST: [...LICENSED_ALL, "encounter.template.dental_chart", "rx.prescribe", "orders.lab_radiology"],
    PHYSIOTHERAPIST: [...LICENSED_ALL, "encounter.template.physio", "home_visits.perform"],
    NURSE: [...LICENSED_ALL, "encounter.template.nursing", "mar.administer", "home_visits.perform"],
    ASSISTANT: ["vitals.record", "outcome_measures.record", "sessions.record"],
  },
  verification: {
    PHYSICIAN: {
      verifiable: true,
      registers: [
        reg({ code: "EG_MEDICAL_SYNDICATE", labelEn: "Egyptian Medical Syndicate", labelAr: "نقابة الأطباء المصرية", checklistKey: "syndicate_card", numberFormat: SYNDICATE_NUMBER_FORMAT, isSyndicate: true }),
        // Legacy (ON-03) physicians were verified without a MoH licence number: optional until Ops decide to require it (NEEDS_HUMAN).
        reg({ code: "EG_MOH_LICENCE", labelEn: "Ministry of Health licence", labelAr: "ترخيص وزارة الصحة", checklistKey: "moh_licence", required: false, hasExpiry: true }),
      ],
      requiredDocuments: ["SYNDICATE_CARD", "SPECIALTY_CERTIFICATE"],
      extraChecklist: ["specialty_match", "national_id_present"],
      soloExtraDocuments: [],
      soloExtraChecklist: [],
      badgeEn: "Verified physician",
      badgeAr: "طبيب موثّق",
      labelEn: "Physician",
      labelAr: "طبيب",
    },
    DENTIST: {
      verifiable: true,
      registers: [
        reg({ code: "EG_DENTISTS_SYNDICATE", labelEn: "Egyptian Dentists Syndicate", labelAr: "نقابة أطباء الأسنان المصرية", checklistKey: "syndicate_card", numberFormat: SYNDICATE_NUMBER_FORMAT, isSyndicate: true }),
        reg({ code: "EG_MOH_LICENCE", labelEn: "Ministry of Health licence", labelAr: "ترخيص وزارة الصحة", checklistKey: "moh_licence", hasExpiry: true }),
      ],
      requiredDocuments: ["SYNDICATE_CARD", "MOH_LICENCE"],
      extraChecklist: ["national_id_present"],
      soloExtraDocuments: [],
      soloExtraChecklist: [],
      badgeEn: "Verified dentist",
      badgeAr: "طبيب أسنان موثّق",
      labelEn: "Dentist",
      labelAr: "طبيب أسنان",
    },
    PHYSIOTHERAPIST: {
      verifiable: true,
      registers: [
        reg({ code: "EG_PHYSICAL_THERAPY_SYNDICATE", labelEn: "Physical Therapy Syndicate", labelAr: "نقابة العلاج الطبيعي", checklistKey: "syndicate_card", numberFormat: SYNDICATE_NUMBER_FORMAT, isSyndicate: true }),
        reg({ code: "EG_MOH_PHYSIOTHERAPY_LICENCE", labelEn: "Ministry of Health physiotherapy licence", labelAr: "ترخيص وزارة الصحة للعلاج الطبيعي", checklistKey: "moh_licence", hasExpiry: true }),
      ],
      requiredDocuments: ["SYNDICATE_CARD", "MOH_LICENCE"],
      extraChecklist: ["national_id_present"],
      soloExtraDocuments: [],
      soloExtraChecklist: [],
      badgeEn: "Verified physiotherapist",
      badgeAr: "أخصائي علاج طبيعي موثّق",
      labelEn: "Physiotherapist",
      labelAr: "أخصائي علاج طبيعي",
    },
    NURSE: {
      verifiable: true,
      registers: [
        reg({ code: "EG_NURSING_SYNDICATE", labelEn: "Nursing Professions Syndicate", labelAr: "نقابة المهن التمريضية", checklistKey: "syndicate_card", numberFormat: SYNDICATE_NUMBER_FORMAT, isSyndicate: true }),
        reg({ code: "EG_MOH_LICENCE", labelEn: "Ministry of Health licence", labelAr: "ترخيص وزارة الصحة", checklistKey: "moh_licence", hasExpiry: true }),
      ],
      requiredDocuments: ["SYNDICATE_CARD", "MOH_LICENCE"],
      extraChecklist: ["national_id_present"],
      // PRVER04 / ADR-032 — solo nurses: ID selfie match + criminal-record certificate (Q8 wording: NEEDS_HUMAN).
      soloExtraDocuments: ["ID_SELFIE", "CRIMINAL_RECORD_CERT"],
      soloExtraChecklist: ["id_selfie_match", "criminal_record_certificate"],
      badgeEn: "Verified nurse",
      badgeAr: "ممرض موثّق",
      labelEn: "Nurse",
      labelAr: "ممرض",
    },
    ASSISTANT: {
      verifiable: false,
      registers: [],
      requiredDocuments: [],
      extraChecklist: [],
      soloExtraDocuments: [],
      soloExtraChecklist: [],
      badgeEn: "Supervised assistant",
      badgeAr: "مساعد تحت الإشراف",
      labelEn: "Assistant",
      labelAr: "مساعد",
    },
  },
  reverification: { intervalMonths: 12, reminderDays: [60, 30, 7] },
};

/** Shipped market packs. Markets absent here use the Egypt baseline until they ship their own (KCV205). */
export const DEFAULT_PROFESSION_PACKS: Readonly<Record<string, ProfessionPack>> = { EG: EG_PROFESSION_PACK };

export function checklistKeysFor(rule: ProfessionVerificationRule, solo: boolean): string[] {
  const keys = new Set<string>([...BASE_CHECKLIST, ...rule.registers.filter((r) => r.required).map((r) => r.checklistKey), ...rule.extraChecklist]);
  if (solo) for (const k of rule.soloExtraChecklist) keys.add(k);
  return [...keys];
}

export function requiredDocumentsFor(rule: ProfessionVerificationRule, solo: boolean): string[] {
  return solo ? [...new Set([...rule.requiredDocuments, ...rule.soloExtraDocuments])] : [...rule.requiredDocuments];
}

export class ProfessionPackError extends Error {
  constructor(readonly errors: string[]) {
    super(`Invalid profession pack: ${errors.join("; ")}`);
  }
}

/** Validate an arbitrary JSON value as a profession pack. Unknown capability / profession => errors (PRSOP02). */
export function validateProfessionPack(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["pack must be an object"];
  const p = raw as Record<string, unknown>;
  if (p.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof p.scopeVersion !== "string" || !p.scopeVersion.trim()) errors.push("scopeVersion required (versioned matrix)");
  if (p.cmoSignOff !== null && p.cmoSignOff !== undefined) {
    const s = p.cmoSignOff as Record<string, unknown>;
    if (typeof s.by !== "string" || typeof s.at !== "string") errors.push("cmoSignOff must be null or { by, at }");
  }
  const scope = p.scope as Record<string, unknown> | undefined;
  if (!scope || typeof scope !== "object") {
    errors.push("scope matrix required");
  } else {
    for (const prof of Object.keys(scope)) {
      if (!(PROFESSIONS as readonly string[]).includes(prof)) errors.push(`scope: unknown profession ${prof}`);
    }
    for (const prof of PROFESSIONS) {
      const caps = scope[prof];
      if (!Array.isArray(caps)) {
        errors.push(`scope.${prof} must list capabilities`);
        continue;
      }
      for (const c of caps) if (!isScopeCapability(c)) errors.push(`scope.${prof}: unknown capability "${String(c)}"`);
    }
  }
  const ver = p.verification as Record<string, unknown> | undefined;
  if (!ver || typeof ver !== "object") {
    errors.push("verification rules required");
  } else {
    for (const prof of PROFESSIONS) {
      const r = ver[prof] as Record<string, unknown> | undefined;
      if (!r) {
        errors.push(`verification.${prof} missing`);
        continue;
      }
      if (typeof r.verifiable !== "boolean") errors.push(`verification.${prof}.verifiable must be boolean`);
      if (!Array.isArray(r.registers)) errors.push(`verification.${prof}.registers must be an array`);
      for (const k of ["requiredDocuments", "extraChecklist", "soloExtraDocuments", "soloExtraChecklist"]) {
        if (!Array.isArray(r[k])) errors.push(`verification.${prof}.${k} must be an array`);
      }
      for (const k of ["badgeEn", "badgeAr", "labelEn", "labelAr"]) {
        if (typeof r[k] !== "string" || !(r[k] as string).trim()) errors.push(`verification.${prof}.${k} required (AR/EN)`);
      }
      if (r.verifiable === true && Array.isArray(r.registers) && r.registers.length === 0) {
        errors.push(`verification.${prof}: a verifiable profession needs at least one register`);
      }
      if (Array.isArray(r.registers)) {
        for (const reg of r.registers as Record<string, unknown>[]) {
          if (typeof reg.code !== "string" || !reg.code) errors.push(`verification.${prof}: register without code`);
          if (reg.numberFormat != null) {
            try {
              new RegExp(String(reg.numberFormat));
            } catch {
              errors.push(`verification.${prof}.${String(reg.code)}: numberFormat is not a valid regex`);
            }
          }
        }
      }
    }
  }
  const rv = p.reverification as Record<string, unknown> | undefined;
  if (!rv || typeof rv.intervalMonths !== "number" || rv.intervalMonths <= 0) errors.push("reverification.intervalMonths must be a positive number");
  else if (!Array.isArray(rv.reminderDays) || rv.reminderDays.some((d) => typeof d !== "number" || d <= 0)) errors.push("reverification.reminderDays must be positive numbers");
  return errors;
}

export function parseProfessionPack(raw: unknown): ProfessionPack {
  const errors = validateProfessionPack(raw);
  if (errors.length) throw new ProfessionPackError(errors);
  return raw as ProfessionPack;
}

/** Pack for a market: `Market.clinicalConfig.professionPack` when present and valid, else the shipped default. */
export function resolveProfessionPack(market: { code?: string | null; clinicalConfig?: unknown } | null | undefined): ProfessionPack {
  const cfg = market?.clinicalConfig;
  if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
    const override = (cfg as Record<string, unknown>).professionPack;
    if (override != null && validateProfessionPack(override).length === 0) return override as ProfessionPack;
  }
  const code = market?.code?.trim().toUpperCase();
  return (code ? DEFAULT_PROFESSION_PACKS[code] : undefined) ?? EG_PROFESSION_PACK;
}

export function scopeAllows(pack: ProfessionPack, profession: Profession, capability: ScopeCapability): boolean {
  return pack.scope[profession]?.includes(capability) ?? false;
}

export function capabilitiesFor(pack: ProfessionPack, profession: Profession): ScopeCapability[] {
  return SCOPE_CAPABILITIES.filter((c) => scopeAllows(pack, profession, c));
}

export function isListableProfession(pack: ProfessionPack, profession: Profession | null | undefined): boolean {
  if (!profession) return false;
  return pack.verification[profession]?.verifiable === true;
}
