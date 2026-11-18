import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import i18next from "i18next";
import {
  noShowRiskChipText,
  noShowRiskExplanation,
  noShowRiskSuggestionText,
  type NoShowRiskView,
} from "./no-show-risk";

const load = (lng: string) => JSON.parse(readFileSync(new URL(`../locales/${lng}.json`, import.meta.url), "utf8")) as object;

async function translator(lng: "en" | "ar") {
  const i = i18next.createInstance();
  await i.init({ lng, resources: { en: { translation: load("en") }, ar: { translation: load("ar") } }, interpolation: { escapeValue: false } });
  return i.t.bind(i) as Parameters<typeof noShowRiskChipText>[1];
}

const high: NoShowRiskView = {
  score: 66,
  band: "HIGH",
  method: "RULE_BASED",
  factors: ["PRIOR_NO_SHOWS", "DEPOSIT_FLAG"],
  priorNoShows: 3,
  suggestion: "DEPOSIT",
};

describe("FS-05 no-show risk label", () => {
  it("label says rule-based (EN + AR) while method is RULE_BASED", async () => {
    const en = await translator("en");
    assert.equal(noShowRiskChipText(high, en), "High no-show risk · rule-based");
    assert.match(noShowRiskExplanation(high, en), /^Rule-based estimate .* not a trained prediction model\. Based on: 3 previous no-shows · deposit required/);
    const ar = await translator("ar");
    assert.equal(noShowRiskChipText(high, ar), "احتمال تغيّب مرتفع · تقدير بالقواعد");
    assert.match(noShowRiskExplanation(high, ar), /ليس نموذج تنبؤ/);
  });

  it("only a trained model may drop the rule-based wording", async () => {
    const en = await translator("en");
    const model = { ...high, method: "TRAINED_MODEL" };
    assert.doesNotMatch(noShowRiskChipText(model, en), /rule-based/);
    assert.doesNotMatch(noShowRiskExplanation(model, en), /Rule-based/);
  });

  it("plural factor wording and suggestions", async () => {
    const en = await translator("en");
    assert.match(noShowRiskExplanation({ ...high, priorNoShows: 1, factors: ["PRIOR_NO_SHOWS"] }, en), /1 previous no-show$/);
    assert.equal(noShowRiskSuggestionText(high, en), "Consider asking for a deposit to hold this slot.");
    assert.equal(noShowRiskSuggestionText({ suggestion: null }, en), null);
    const ar = await translator("ar");
    assert.match(noShowRiskExplanation({ ...high, priorNoShows: 2, factors: ["PRIOR_NO_SHOWS"] }, ar), /حالتا تغيّب سابقتان/);
  });
});
