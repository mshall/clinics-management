import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyEdition, editionFromHost, editionOverrides, NURSE_ACCENT_HEX, resolveEdition } from "./edition";

describe("edition (ADR-031): web mirror of the API tables", () => {
  it("host handling: nurse.kiorly.com means NURSE only before sign-in; the org's edition wins afterwards", () => {
    assert.equal(editionFromHost("nurse.kiorly.com"), "NURSE");
    assert.equal(editionFromHost("nurse.localhost:5174"), "NURSE");
    assert.equal(editionFromHost("app.kiorly.com"), null);
    assert.equal(editionFromHost("nurse.kiorly.com.evil.io"), null);
    assert.equal(resolveEdition({ host: "nurse.kiorly.com" }), "NURSE");
    assert.equal(resolveEdition({ orgEdition: "CLINIC", host: "nurse.kiorly.com" }), "CLINIC");
  });

  it("terminology: Clinic -> Practice/Agency, Encounter -> Visit record, AR + EN; Clinic edition has no overrides", () => {
    assert.equal(NURSE_ACCENT_HEX, "#E11D48");
    assert.equal(editionOverrides("NURSE", "SOLO", "en")["nav.encounters"], "Visit records");
    assert.equal(editionOverrides("NURSE", "SOLO", "en")["nav.clinics"], "Practice");
    assert.equal(editionOverrides("NURSE", "AGENCY", "en")["nav.clinics"], "Agency");
    assert.ok(/[؀-ۿ]/.test(editionOverrides("NURSE", "SOLO", "ar")["nav.encounters"]!));
    assert.deepEqual(editionOverrides("CLINIC", null, "en"), {});
    assert.deepEqual(Object.keys(editionOverrides("NURSE", "SOLO", "en")).sort(), Object.keys(editionOverrides("NURSE", "SOLO", "ar")).sort(), "every override has an AR twin");
  });

  it("applyEdition sets the accent hook and the translation bundles, and clears them for Clinic", () => {
    const calls: string[] = [];
    const i18n = { addResource: (l: string, _ns: string, k: string, v: string) => calls.push(`${l}:${k}=${v}`) };
    const doc = { documentElement: { dataset: {} as Record<string, string> }, title: "" };
    applyEdition("NURSE", "SOLO", i18n, doc as never);
    assert.equal(doc.documentElement.dataset.edition, "nurse");
    assert.equal(doc.title, "Kiorly Nurse");
    assert.ok(calls.includes("en:app.name=Kiorly Nurse"));
    applyEdition("CLINIC", null, i18n, doc as never);
    assert.equal(doc.documentElement.dataset.edition, undefined);
  });
});
