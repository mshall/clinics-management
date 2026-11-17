import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDrugIngredients } from "./drug-ingredient-resolver";

describe("CL-01 drug ingredient resolver (alias fallback)", () => {
  it("Augmentin maps to amoxicillin + clavulanic acid via alias list when DB not loaded", async () => {
    const resolved = await resolveDrugIngredients(
      { drugProduct: { findFirst: async () => null } } as never,
      null,
      "Augmentin 1g",
    );
    assert.equal(resolved.matchedCatalog, true);
    assert.ok(
      resolved.ingredientNames.some((n) => n.includes("amoxicillin")),
      `expected amoxicillin in ${resolved.ingredientNames.join(",")}`,
    );
    assert.ok(
      resolved.ingredientNames.some((n) => n.includes("clavulanate") || n.includes("clavulanic")),
      `expected clavulanate in ${resolved.ingredientNames.join(",")}`,
    );
  });
});