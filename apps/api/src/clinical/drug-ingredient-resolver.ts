import type { PrismaClient } from "@prisma/client";
import { normalizeDrugNameForSafety } from "../common/egypt-drug-aliases";

export type ResolvedDrugIngredients = {
  drugName: string;
  matchedCatalog: boolean;
  drugProductId: string | null;
  ingredientNames: string[];
};

/** Expand a prescription line to generic ingredient tokens for interaction / allergy checks. */
export async function resolveDrugIngredients(
  prisma: PrismaClient,
  marketId: string | null | undefined,
  drugName: string,
  drugProductId?: string | null,
): Promise<ResolvedDrugIngredients> {
  const trimmed = drugName.trim();
  if (drugProductId && marketId) {
    const product = await prisma.drugProduct.findFirst({
      where: { id: drugProductId, marketId, isActive: true },
      include: { ingredients: { include: { ingredient: true } } },
    });
    if (product) {
      const names = product.ingredients.map((pi) => pi.ingredient.nameEn.toLowerCase());
      return {
        drugName: trimmed,
        matchedCatalog: true,
        drugProductId: product.id,
        ingredientNames: names.length ? names : [product.brandNameEn.toLowerCase()],
      };
    }
  }

  if (marketId && trimmed.length >= 2) {
    const probe = trimmed.split(/\s+/)[0] ?? trimmed;
    const brandHit = await prisma.drugProduct.findFirst({
      where: {
        marketId,
        isActive: true,
        OR: [
          { brandNameEn: { equals: probe, mode: "insensitive" } },
          { brandNameEn: { startsWith: probe, mode: "insensitive" } },
        ],
      },
      include: { ingredients: { include: { ingredient: true } } },
      orderBy: { brandNameEn: "asc" },
    });
    if (brandHit) {
      const names = brandHit.ingredients.map((pi) => pi.ingredient.nameEn.toLowerCase());
      return {
        drugName: trimmed,
        matchedCatalog: true,
        drugProductId: brandHit.id,
        ingredientNames: names.length ? names : [brandHit.brandNameEn.toLowerCase()],
      };
    }
  }

  const legacy = normalizeDrugNameForSafety(trimmed);
  return {
    drugName: trimmed,
    matchedCatalog: legacy.matchedCatalog,
    drugProductId: null,
    ingredientNames: legacy.canonical.split(/\s+/).filter((t) => t.length > 2),
  };
}

export function ingredientTokensOverlap(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  return a.some((t) => setB.has(t) || [...setB].some((u) => u.includes(t) || t.includes(u)));
}