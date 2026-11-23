import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentQualityLabel } from "./document-quality-label";

const t = (_key: string, fallback: string) => fallback;

describe("documentQualityLabel", () => {
  it("shows original kept", () => {
    assert.equal(
      documentQualityLabel({ qualityNote: "ORIGINAL_KEPT", sizeBytes: 1000 }, t),
      "Original quality kept",
    );
  });

  it("shows optimised with quality and original available", () => {
    const label = documentQualityLabel(
      {
        qualityNote: "REDUCED",
        sizeBytes: 3 * 1024 * 1024,
        qualityUsed: 88,
        originalAvailable: true,
      },
      t,
    );
    assert.match(label ?? "", /Optimised to 3\.0 MB \(quality 88\)/);
    assert.match(label ?? "", /Original available/);
  });
});
