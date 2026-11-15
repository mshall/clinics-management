import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDrugNameForSafety } from "./egypt-drug-aliases";

test("Augmentin maps to amoxicillin clavulanate", () => {
  const { canonical, matchedCatalog } = normalizeDrugNameForSafety("Augmentin 1g");
  assert.ok(matchedCatalog);
  assert.match(canonical, /amoxicillin/);
});