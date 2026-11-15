import assert from "node:assert/strict";
import test from "node:test";
import { parseMarketAiConfig } from "./ai-market-config";

test("parseMarketAiConfig reads ai block from providerConfig", () => {
  const cfg = parseMarketAiConfig({
    fiscal: { key: "eta-egypt" },
    ai: {
      key: "openai-compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3",
      secretRef: "env:AI_API_KEY",
      promptVersion: "v1",
    },
  });
  assert.ok(cfg);
  assert.equal(cfg?.key, "openai-compatible");
  assert.equal(cfg?.model, "llama3");
  assert.equal(cfg?.baseUrl, "http://127.0.0.1:11434/v1");
});