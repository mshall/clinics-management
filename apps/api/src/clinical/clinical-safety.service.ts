import { Injectable } from "@nestjs/common";
import { PatientAllergyCode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { drugNamesMatchForInteraction, normalizeDrugNameForSafety } from "../common/egypt-drug-aliases";

const ALLERGY_DRUG_HINTS: Record<PatientAllergyCode, string[]> = {
  PENICILLIN: ["penicillin", "amoxicillin", "ampicillin", "piperacillin"],
  AMOXICILLIN: ["amoxicillin", "amoxicillin/clavulanate", "augmentin"],
  SULFA: ["sulfa", "sulfamethoxazole", "trimethoprim", "bactrim"],
  ASPIRIN: ["aspirin", "acetylsalicylic"],
  NSAIDS: ["ibuprofen", "naproxen", "diclofenac", "ketorolac", "nsaid"],
  LATEX: ["latex"],
  PEANUTS: ["peanut"],
  TREE_NUTS: ["almond", "walnut", "cashew"],
  SHELLFISH: ["shellfish", "shrimp", "crab"],
  EGGS: ["egg"],
  MILK: ["milk", "dairy"],
  SOY: ["soy"],
  WHEAT: ["wheat", "gluten"],
  BEE_STING: ["bee", "wasp"],
  CONTRAST_IODINE: ["contrast", "iodine", "iopamidol"],
  CODEINE: ["codeine"],
  MORPHINE: ["morphine", "opioid"],
  OTHER: [],
};

export type ClinicalSafetyWarning = {
  kind: "allergy" | "interaction";
  severity: string;
  messageEn: string;
  messageAr: string;
  /** True when matching used brand-name normalization — not the national drug catalog. */
  limitedCheck?: boolean;
};

@Injectable()
export class ClinicalSafetyService {
  constructor(private readonly prisma: PrismaService) {}

  private drugMatchesAllergy(drugName: string, code: PatientAllergyCode, otherComment: string | null): boolean {
    const { canonical, matchedCatalog } = normalizeDrugNameForSafety(drugName);
    const d = `${drugName.toLowerCase()} ${canonical}`;
    if (code === PatientAllergyCode.OTHER) {
      const o = (otherComment ?? "").toLowerCase().trim();
      return o.length > 2 && (d.includes(o) || canonical.includes(o));
    }
    const hit = ALLERGY_DRUG_HINTS[code].some((hint) => d.includes(hint) || canonical.includes(hint));
    return hit || (!matchedCatalog && code === PatientAllergyCode.AMOXICILLIN && drugName.toLowerCase().includes("augment"));
  }

  async checkMedicationSafety(
    tenantId: string,
    patientId: string,
    drugName: string,
    existingDrugNames: string[],
  ): Promise<ClinicalSafetyWarning[]> {
    const warnings: ClinicalSafetyWarning[] = [];
    const { matchedCatalog } = normalizeDrugNameForSafety(drugName);
    const limitedCheck = !matchedCatalog;
    const allergies = await this.prisma.patientAllergy.findMany({
      where: { tenantId, patientId },
      select: { code: true, otherComment: true },
    });
    for (const a of allergies) {
      if (this.drugMatchesAllergy(drugName, a.code, a.otherComment)) {
        warnings.push({
          kind: "allergy",
          severity: "high",
          messageEn: limitedCheck
            ? `Patient allergy (${a.code}) may conflict with ${drugName} (limited brand-name check — verify against Egyptian formulary).`
            : `Patient allergy (${a.code}) may conflict with ${drugName}.`,
          messageAr: limitedCheck
            ? `حساسية المريض (${a.code}) قد تتعارض مع ${drugName} (فحص محدود بأسماء تجارية — راجع الدليل الدوائي المصري).`
            : `حساسية المريض (${a.code}) قد تتعارض مع ${drugName}.`,
          limitedCheck: limitedCheck || undefined,
        });
      }
    }

    const rules = await this.prisma.drugInteractionRule.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
    });
    const matchesRuleDrug = (typed: string, ruleDrug: string) => {
      const n = normalizeDrugNameForSafety(typed).canonical;
      const r = ruleDrug.toLowerCase();
      return n.includes(r) || typed.toLowerCase().includes(r) || drugNamesMatchForInteraction(typed, ruleDrug);
    };
    for (const other of existingDrugNames) {
      for (const rule of rules) {
        const hit =
          (matchesRuleDrug(drugName, rule.drugA) && matchesRuleDrug(other, rule.drugB)) ||
          (matchesRuleDrug(drugName, rule.drugB) && matchesRuleDrug(other, rule.drugA));
        if (hit) {
          warnings.push({
            kind: "interaction",
            severity: rule.severity,
            messageEn: limitedCheck
              ? `${rule.messageEn} (Limited check: typed drug names only — Egyptian national list not loaded.)`
              : rule.messageEn,
            messageAr: rule.messageAr || rule.messageEn,
            limitedCheck: limitedCheck || undefined,
          });
        }
      }
    }
    if (!warnings.length && limitedCheck && drugName.trim().length > 1) {
      warnings.push({
        kind: "interaction",
        severity: "info",
        messageEn:
          "Drug interaction check is limited to typed names and local alias list — not the full Egyptian drug catalog.",
        messageAr: "فحص التفاعلات الدوائية محدود بالأسماء المدخلة وقائمة الأسماء التجارية — وليس الدليل الدوائي المصري الكامل.",
        limitedCheck: true,
      });
    }
    return warnings;
  }

  async ensureDefaultCatalog(tenantId: string): Promise<void> {
    const { ensureTenantDefaultClinicalFormTemplates } = await import("./clinical-default-form-templates");
    await ensureTenantDefaultClinicalFormTemplates(this.prisma, tenantId);
    const icdCount = await this.prisma.icd10Entry.count({ where: { tenantId: null } });
    if (icdCount === 0) {
      const { DEFAULT_ICD10, DEFAULT_DRUG_INTERACTIONS } = await import("./clinical-default-catalog");
      await this.prisma.icd10Entry.createMany({
        data: DEFAULT_ICD10.map((r) => ({ ...r, tenantId: null })),
      });
      await this.prisma.drugInteractionRule.createMany({
        data: DEFAULT_DRUG_INTERACTIONS.map((r) => ({ ...r, tenantId: null })),
      });
    }
    const tenantIcd = await this.prisma.icd10Entry.count({ where: { tenantId } });
    if (tenantIcd === 0) {
      const globals = await this.prisma.icd10Entry.findMany({ where: { tenantId: null } });
      if (globals.length) {
        await this.prisma.icd10Entry.createMany({
          data: globals.map((g) => ({
            tenantId,
            icd10Code: g.icd10Code,
            descriptionEn: g.descriptionEn,
            descriptionAr: g.descriptionAr,
            keywords: g.keywords,
          })),
        });
      }
    }
  }
}
