import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RxSafetyCheckService } from "./rx-safety-check.service";
import type { RxSafetyAlert } from "./rx-safety.types";

/** @deprecated shape — use RxSafetyAlert from POST /clinical/rx/check */
export type ClinicalSafetyWarning = {
  kind: string;
  severity: string;
  messageEn: string;
  messageAr: string;
  limitedCheck?: boolean;
  unverifiedDrug?: boolean;
  requiresOverride?: boolean;
  itemIndex?: number;
};

@Injectable()
export class ClinicalSafetyService {
  constructor(
    private readonly rxSafety: RxSafetyCheckService,
    private readonly prisma: PrismaService,
  ) {}

  private mapAlert(a: RxSafetyAlert): ClinicalSafetyWarning {
    return {
      kind: a.kind,
      severity: a.severity,
      messageEn: a.messageEn,
      messageAr: a.messageAr,
      requiresOverride: a.requiresOverride || undefined,
      itemIndex: a.itemIndex,
      unverifiedDrug: a.kind === "unavailable" ? true : undefined,
      limitedCheck: a.kind === "unavailable" ? true : undefined,
    };
  }

  async checkMedicationSafety(
    tenantId: string,
    patientId: string,
    drugName: string,
    existingDrugNames: string[],
    options?: { drugProductId?: string | null; marketId?: string | null },
  ): Promise<ClinicalSafetyWarning[]> {
    const items = [
      ...existingDrugNames.map((name) => ({ drugName: name })),
      { drugName, drugProductId: options?.drugProductId },
    ];
    const { alerts } = await this.rxSafety.checkRx(tenantId, patientId, items);
    const idx = items.length - 1;
    return alerts
      .filter((a) => a.itemIndex === undefined || a.itemIndex === idx || a.relatedItemIndex === idx)
      .map((a) => this.mapAlert(a));
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
        data: DEFAULT_DRUG_INTERACTIONS.map((r) => ({
          tenantId: null,
          drugA: r.ingredientA,
          drugB: r.ingredientB,
          ingredientA: r.ingredientA,
          ingredientB: r.ingredientB,
          severity: r.severity,
          messageEn: r.messageEn,
          messageAr: r.messageAr,
        })),
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