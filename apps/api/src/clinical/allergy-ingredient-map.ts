import { PatientAllergyCode } from "@prisma/client";

/** Ingredient / class tokens matched against resolved generic names (CL-02). */
export const ALLERGY_INGREDIENT_TOKENS: Record<PatientAllergyCode, string[]> = {
  PENICILLIN: ["penicillin", "amoxicillin", "ampicillin", "piperacillin", "clavulanate", "clavulanic"],
  AMOXICILLIN: ["amoxicillin", "clavulanate", "clavulanic"],
  SULFA: ["sulfa", "sulfamethoxazole", "trimethoprim", "sulfonamide"],
  ASPIRIN: ["aspirin", "acetylsalicylic", "salicylate"],
  NSAIDS: ["ibuprofen", "naproxen", "diclofenac", "ketorolac", "indomethacin", "nsaid"],
  LATEX: ["latex"],
  PEANUTS: ["peanut", "arachis"],
  TREE_NUTS: ["almond", "walnut", "cashew", "tree nut"],
  SHELLFISH: ["shellfish", "shrimp", "crab", "crustacean"],
  EGGS: ["egg", "albumin"],
  MILK: ["milk", "lactose", "dairy", "casein"],
  SOY: ["soy", "soya"],
  WHEAT: ["wheat", "gluten"],
  BEE_STING: ["bee", "wasp", "venom"],
  CONTRAST_IODINE: ["contrast", "iodine", "iopamidol", "iohexol"],
  CODEINE: ["codeine"],
  MORPHINE: ["morphine", "opioid"],
  OTHER: [],
};

export function allergyMatchesIngredients(
  code: PatientAllergyCode,
  ingredientNames: string[],
  otherComment: string | null,
): boolean {
  const hay = ingredientNames.join(" ").toLowerCase();
  if (code === PatientAllergyCode.OTHER) {
    const o = (otherComment ?? "").toLowerCase().trim();
    return o.length > 2 && hay.includes(o);
  }
  return ALLERGY_INGREDIENT_TOKENS[code].some((token) => hay.includes(token));
}