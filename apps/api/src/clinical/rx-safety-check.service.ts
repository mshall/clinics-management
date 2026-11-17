import { Injectable } from "@nestjs/common";
import { PatientAllergyCode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { allergyMatchesIngredients } from "./allergy-ingredient-map";
import { resolveDrugIngredients, type ResolvedDrugIngredients } from "./drug-ingredient-resolver";
import { normalizeRxSeverity, severityRequiresOverride } from "./rx-safety-severity";
import type { RxCheckItemInput, RxSafetyAlert, RxSafetyCheckResult } from "./rx-safety.types";

function ingredientKeyHit(ingredients: string[], key: string): boolean {
  const k = key.toLowerCase().trim();
  if (!k) return false;
  return ingredients.some((i) => i === k || i.includes(k) || k.includes(i));
}

function sharedIngredient(a: ResolvedDrugIngredients, b: ResolvedDrugIngredients): string | null {
  for (const t of a.ingredientNames) {
    if (b.ingredientNames.some((u) => u === t || u.includes(t) || t.includes(u))) return t;
  }
  return null;
}

@Injectable()
export class RxSafetyCheckService {
  constructor(private readonly prisma: PrismaService) {}

  async checkRx(tenantId: string, patientId: string, items: RxCheckItemInput[]): Promise<RxSafetyCheckResult> {
    const alerts: RxSafetyAlert[] = [];
    let hasUnverifiedItems = false;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { marketId: true },
    });
    const marketId = tenant?.marketId ?? null;

    const resolved: ResolvedDrugIngredients[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const row = await resolveDrugIngredients(this.prisma, marketId, item.drugName, item.drugProductId);
      resolved.push(row);
      const unverified = !item.drugProductId && !row.matchedCatalog;
      if (unverified) {
        hasUnverifiedItems = true;
        alerts.push({
          kind: "unavailable",
          severity: "info",
          messageEn: `Safety check unavailable for "${item.drugName}" — link a catalog product for ingredient-level checks.`,
          messageAr: `فحص السلامة غير متاح لـ "${item.drugName}" — اختر منتجًا من الدليل الدوائي لفحص المادة الفعالة.`,
          requiresOverride: false,
          itemIndex: i,
        });
      }
    }

    const allergies = await this.prisma.patientAllergy.findMany({
      where: { tenantId, patientId },
      select: { code: true, otherComment: true },
    });

    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i]!;
      if (!r.matchedCatalog && !items[i]?.drugProductId) continue;
      for (const a of allergies) {
        if (allergyMatchesIngredients(a.code as PatientAllergyCode, r.ingredientNames, a.otherComment)) {
          const severity = a.code === PatientAllergyCode.CONTRAST_IODINE ? "major" : "contraindicated";
          alerts.push({
            kind: "allergy",
            severity,
            messageEn: `Patient allergy (${a.code}) conflicts with ingredients in ${items[i]!.drugName}.`,
            messageAr: `حساسية المريض (${a.code}) تتعارض مع المواد الفعالة في ${items[i]!.drugName}.`,
            requiresOverride: severityRequiresOverride(severity),
            itemIndex: i,
          });
        }
      }
    }

    const rules = await this.prisma.drugInteractionRule.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
    });

    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        if (!resolved[i]!.matchedCatalog || !resolved[j]!.matchedCatalog) continue;
        const dup = sharedIngredient(resolved[i]!, resolved[j]!);
        if (dup) {
          const severity = "moderate" as const;
          alerts.push({
            kind: "duplication",
            severity,
            messageEn: `Therapeutic duplication: both lines contain "${dup}" (${items[i]!.drugName} and ${items[j]!.drugName}).`,
            messageAr: `تكرار علاجي: كلا السطرين يحتويان على "${dup}" (${items[i]!.drugName} و ${items[j]!.drugName}).`,
            requiresOverride: severityRequiresOverride(severity),
            itemIndex: i,
            relatedItemIndex: j,
          });
        }
        for (const rule of rules) {
          const ingA = rule.ingredientA?.trim() || rule.drugA;
          const ingB = rule.ingredientB?.trim() || rule.drugB;
          const hit =
            (ingredientKeyHit(resolved[i]!.ingredientNames, ingA) &&
              ingredientKeyHit(resolved[j]!.ingredientNames, ingB)) ||
            (ingredientKeyHit(resolved[i]!.ingredientNames, ingB) &&
              ingredientKeyHit(resolved[j]!.ingredientNames, ingA));
          if (!hit) continue;
          const severity = normalizeRxSeverity(rule.severity);
          alerts.push({
            kind: "interaction",
            severity,
            messageEn: rule.messageEn,
            messageAr: rule.messageAr || rule.messageEn,
            requiresOverride: severityRequiresOverride(severity),
            itemIndex: i,
            relatedItemIndex: j,
            ruleId: rule.id,
          });
        }
      }
    }

    return { alerts, hasUnverifiedItems };
  }

  async assertSaveAllowed(
    tenantId: string,
    patientId: string,
    newItem: RxCheckItemInput,
    existingItems: RxCheckItemInput[],
    safetyOverrideReason?: string | null,
  ): Promise<RxSafetyCheckResult> {
    const items = [...existingItems, newItem];
    const result = await this.checkRx(tenantId, patientId, items);
    const blocking = result.alerts.filter((a) => a.requiresOverride);
    if (blocking.length > 0 && !safetyOverrideReason?.trim()) {
      return result;
    }
    return result;
  }
}