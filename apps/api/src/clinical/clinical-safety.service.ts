import { Injectable } from "@nestjs/common";
import { PatientAllergyCode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

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
};

@Injectable()
export class ClinicalSafetyService {
  constructor(private readonly prisma: PrismaService) {}

  private drugMatchesAllergy(drugName: string, code: PatientAllergyCode, otherComment: string | null): boolean {
    const d = drugName.toLowerCase();
    if (code === PatientAllergyCode.OTHER) {
      const o = (otherComment ?? "").toLowerCase().trim();
      return o.length > 2 && d.includes(o);
    }
    return ALLERGY_DRUG_HINTS[code].some((hint) => d.includes(hint));
  }

  async checkMedicationSafety(
    tenantId: string,
    patientId: string,
    drugName: string,
    existingDrugNames: string[],
  ): Promise<ClinicalSafetyWarning[]> {
    const warnings: ClinicalSafetyWarning[] = [];
    const allergies = await this.prisma.patientAllergy.findMany({
      where: { tenantId, patientId },
      select: { code: true, otherComment: true },
    });
    for (const a of allergies) {
      if (this.drugMatchesAllergy(drugName, a.code, a.otherComment)) {
        warnings.push({
          kind: "allergy",
          severity: "high",
          messageEn: `Patient allergy (${a.code}) may conflict with ${drugName}.`,
          messageAr: `حساسية المريض (${a.code}) قد تتعارض مع ${drugName}.`,
        });
      }
    }

    const rules = await this.prisma.drugInteractionRule.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
    });
    const dNew = drugName.toLowerCase();
    for (const other of existingDrugNames) {
      const dOther = other.toLowerCase();
      for (const rule of rules) {
        const a = rule.drugA.toLowerCase();
        const b = rule.drugB.toLowerCase();
        const hit =
          (dNew.includes(a) && dOther.includes(b)) || (dNew.includes(b) && dOther.includes(a));
        if (hit) {
          warnings.push({
            kind: "interaction",
            severity: rule.severity,
            messageEn: rule.messageEn,
            messageAr: rule.messageAr || rule.messageEn,
          });
        }
      }
    }
    return warnings;
  }

  async ensureDefaultCatalog(tenantId: string): Promise<void> {
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
