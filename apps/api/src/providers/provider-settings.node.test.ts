import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeProviderBlock, resolveEtaClinicSettings } from "./provider-settings";

test("resolveEtaClinicSettings reads eta-egypt block from providerSettings JSON", () => {
  const settings = resolveEtaClinicSettings({
    providerSettings: {
      "eta-egypt": {
        branchCode: "B01",
        receiptsEnabled: true,
      },
    },
  });
  assert.equal(settings.branchCode, "B01");
  assert.equal(settings.receiptsEnabled, true);
});

test("mergeProviderBlock merges provider patches", () => {
  const next = mergeProviderBlock({}, "eta-egypt", { branchCode: "X" }) as Record<string, Record<string, unknown>>;
  assert.equal(next["eta-egypt"]?.branchCode, "X");
});