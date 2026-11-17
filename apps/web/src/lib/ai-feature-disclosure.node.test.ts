import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { AI_FEATURES } from "./ai-feature-disclosure";

const ROOT = join(import.meta.dirname, "..");
const EN = JSON.parse(readFileSync(join(ROOT, "locales/en.json"), "utf8")) as Record<string, unknown>;
const AR = JSON.parse(readFileSync(join(ROOT, "locales/ar.json"), "utf8")) as Record<string, unknown>;
const GUIDE_SRC = readFileSync(join(ROOT, "features/guide/role-guide-content.ts"), "utf8");

function enPath(key: string): string {
  const parts = key.split(".");
  let cur: unknown = EN;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as object)) cur = (cur as Record<string, unknown>)[p];
    else return "";
  }
  return typeof cur === "string" ? cur : "";
}

function arPath(key: string): string {
  const parts = key.split(".");
  let cur: unknown = AR;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as object)) cur = (cur as Record<string, unknown>)[p];
    else return "";
  }
  return typeof cur === "string" ? cur : "";
}

describe("AI-03 honest AI labels", () => {
  it("every feature has en+ar title and disclosure", () => {
    for (const def of Object.values(AI_FEATURES)) {
      assert.ok(enPath(def.titleKey), `missing en ${def.titleKey}`);
      assert.ok(arPath(def.titleKey), `missing ar ${def.titleKey}`);
      assert.ok(enPath(def.disclosureKey), `missing en ${def.disclosureKey}`);
      assert.ok(arPath(def.disclosureKey), `missing ar ${def.disclosureKey}`);
    }
  });

  it("rule-based features do not use AI badge and avoid 'AI' in English titles", () => {
    for (const def of Object.values(AI_FEATURES)) {
      if (def.backing === "model") {
        assert.equal(def.showsAiBadge, true, def.id);
        continue;
      }
      assert.equal(def.showsAiBadge, false, def.id);
      const title = enPath(def.titleKey);
      assert.ok(!/\bAI\b/i.test(title), `${def.id} title must not claim AI: ${title}`);
    }
  });

  it("model-backed assistant title keeps AI disclosure", () => {
    const title = enPath("aiFeatures.roleAssistant.title");
    const disclosure = enPath("aiFeatures.roleAssistant.disclosure");
    assert.match(title, /assistant/i);
    assert.match(disclosure, /language model|LLM|model/i);
  });

  it("marketing signup bullets match backing (no false AI on rule features)", () => {
    const bullets = EN.signup as { capabilityBullets?: Record<string, string> };
    assert.ok(bullets?.capabilityBullets, "signup.capabilityBullets");
    const pre = bullets.capabilityBullets!.preVisitSummary;
    const risk = bullets.capabilityBullets!.noShowRisk;
    const assist = bullets.capabilityBullets!.roleAssistant;
    assert.ok(!/\bAI\b/i.test(pre), pre);
    assert.ok(!/\bAI\b/i.test(risk), risk);
    assert.match(assist, /AI|language model|model/i);
  });

  it("in-app guide copy matches honest pre-visit and scribe labels", () => {
    assert.ok(GUIDE_SRC.includes("GUIDE_HONEST_AI_EN.preVisitTitle"), "guide uses honest pre-visit title");
    assert.ok(GUIDE_SRC.includes("GUIDE_HONEST_AI_EN.scribeTitle"), "guide uses honest scribe title");
    assert.ok(!GUIDE_SRC.includes("Pre-visit summary (AI)"), "removed false AI pre-visit title");
    assert.ok(!GUIDE_SRC.includes("AI scribe (approve)"), "removed false AI scribe title");
  });
});