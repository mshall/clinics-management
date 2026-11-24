import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { parseDismissedKeys, UserPreferencesService } from "./user-preferences.service";

const fakePrisma = (initial: unknown) => {
  const row = { uiPrefs: initial } as { uiPrefs: unknown };
  return { row, user: { findUnique: async () => row, update: async ({ data }: { data: { uiPrefs: unknown } }) => { row.uiPrefs = data.uiPrefs; } } };
};

describe("per-user dismissed cards", () => {
  it("normalises, de-duplicates and sorts keys; rejects anything unsafe", () => {
    assert.deepEqual(parseDismissedKeys(["kiorex.homeCard", " b ", "kiorex.homeCard"]), ["b", "kiorex.homeCard"]);
    for (const bad of ["x", [1], [""], ["a b"], ["<script>"], Array.from({ length: 51 }, (_, i) => `k${i}`)]) assert.throws(() => parseDismissedKeys(bad), BadRequestException);
  });
  it("empty until first use, then round-trips and keeps other preference fields", async () => {
    const p = fakePrisma(null); const svc = new UserPreferencesService(p as never);
    assert.deepEqual(await svc.getDismissed("u1"), { keys: [] });
    p.row.uiPrefs = { theme: "x" };
    assert.deepEqual(await svc.setDismissed("u1", ["kiorex.homeCard"]), { keys: ["kiorex.homeCard"] });
    assert.deepEqual(p.row.uiPrefs, { theme: "x", dismissedCards: ["kiorex.homeCard"] });
    assert.deepEqual(await svc.getDismissed("u1"), { keys: ["kiorex.homeCard"] });
    assert.deepEqual(await svc.setDismissed("u1", []), { keys: [] });
  });
});
