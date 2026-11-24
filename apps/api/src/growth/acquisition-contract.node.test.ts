import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import examples from "./fixtures/acquisition-examples.json";
import vectors from "./fixtures/growth-vectors.json";
import {
  ACQUISITION_ORIGINS, LINK_CODE_PATTERN, acquisitionOriginOf, canonicalJson, computeInputsHash, isValidWidgetOrigin, parseAcquisitionBlock, type DecisionInputs,
} from "./acquisition-contract";

describe("Clinic copy of the @kiorex/contracts 1.10.0 growth helpers matches the contract vectors (Clinic does not vendor the package)", () => {
  it("canonical JSON vectors", () => {
    for (const v of vectors.canonicalJson) assert.equal(canonicalJson(v.input), v.output);
  });
  it("evidence/inputs hash vectors, independent of touch order", () => {
    for (const v of vectors.inputsHash) {
      assert.equal(computeInputsHash(v.inputs as DecisionInputs), v.hash, v.name);
      assert.equal(computeInputsHash({ ...(v.inputs as DecisionInputs), touches: [...v.inputs.touches].reverse() }), v.hash);
    }
  });
  it("widget origin vectors", () => {
    for (const o of vectors.widgetOrigins.valid) assert.equal(isValidWidgetOrigin(o), true, o);
    for (const o of vectors.widgetOrigins.invalid) assert.equal(isValidWidgetOrigin(o), false, o);
  });
  it("acquisition block examples: every valid example parses, every invalid one is rejected with the documented code", () => {
    for (const [name, block] of Object.entries(examples.valid)) {
      const r = parseAcquisitionBlock(block);
      assert.equal(r.ok, true, name);
    }
    for (const [name, block] of Object.entries(examples.invalid)) {
      const r = parseAcquisitionBlock(block);
      assert.equal(r.ok, false, name);
      if (!r.ok) assert.match(r.code, /^ACQUISITION_(BLOCK_INVALID|EVIDENCE_HASH_INVALID)$/);
    }
    const hash = parseAcquisitionBlock(examples.invalid.shortHash);
    assert.equal(hash.ok === false && hash.code, "ACQUISITION_EVIDENCE_HASH_INVALID");
  });
  it("absent, null or malformed blocks read as UNATTRIBUTED (today's rules); a valid one keeps its origin", () => {
    for (const x of [undefined, null, 5, "x", [], {}, { origin: "PROVIDER_LED" }]) assert.equal(acquisitionOriginOf(x), "UNATTRIBUTED");
    assert.equal(acquisitionOriginOf(examples.valid.providerLedExplicitChannel), "PROVIDER_LED");
    assert.deepEqual([...ACQUISITION_ORIGINS], ["PROVIDER_LED", "MARKETPLACE", "UNATTRIBUTED"]);
  });
  it("unknown reason codes and extra fields are tolerated (forward compatible)", () => {
    assert.equal(parseAcquisitionBlock(examples.valid.futureReasonCodeTolerated).ok, true);
  });
  it("link codes are 8 Crockford base32 characters (no I, L, O, U)", () => {
    assert.match("7K2M9X4Q", LINK_CODE_PATTERN);
    for (const bad of ["7k2m9x4q", "7K2M9X4I", "7K2M9X4O", "7K2M9X4L", "7K2M9X4U", "7K2M9X4"]) assert.doesNotMatch(bad, LINK_CODE_PATTERN);
  });
  it("when the sibling contracts build is present the two implementations agree", async () => {
    const dist = join(process.cwd(), "..", "..", "..", "kiorex-contracts", "dist", "index.cjs");
    if (!existsSync(dist)) return;
    const c = await import(dist);
    if (typeof c.computeAttributionInputsHash !== "function") return; // an older sibling build
    for (const v of vectors.inputsHash) assert.equal(computeInputsHash(v.inputs as DecisionInputs), c.computeAttributionInputsHash(v.inputs));
    for (const [, block] of Object.entries(examples.valid)) assert.equal(parseAcquisitionBlock(block).ok, c.validateAcquisitionBlock(block).valid);
    for (const [, block] of Object.entries(examples.invalid)) assert.equal(parseAcquisitionBlock(block).ok, c.validateAcquisitionBlock(block).valid);
    for (const v of vectors.canonicalJson) assert.equal(canonicalJson(v.input), c.growthCanonicalJson(v.input));
  });
});
