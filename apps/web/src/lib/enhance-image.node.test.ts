import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CLIENT_UPLOAD_HARD_CAP_BYTES,
  isEnhanceableImage,
  shouldPassThroughOriginal,
} from "./enhance-image";

describe("enhance-image pass-through policy", () => {
  it("raises hard cap to 25 MB", () => {
    assert.equal(CLIENT_UPLOAD_HARD_CAP_BYTES, 25 * 1024 * 1024);
  });

  it("passes through document, camera, and general profiles", () => {
    assert.equal(shouldPassThroughOriginal("document"), true);
    assert.equal(shouldPassThroughOriginal("camera"), true);
    assert.equal(shouldPassThroughOriginal("general"), true);
    assert.equal(shouldPassThroughOriginal("avatar"), false);
  });

  it("treats jpeg/png/webp as enhanceable and skips gif/svg", () => {
    assert.equal(isEnhanceableImage(new File([""], "a.jpg", { type: "image/jpeg" })), true);
    assert.equal(isEnhanceableImage(new File([""], "a.gif", { type: "image/gif" })), false);
    assert.equal(isEnhanceableImage(new File([""], "a.svg", { type: "image/svg+xml" })), false);
    assert.equal(isEnhanceableImage(new File([""], "a.pdf", { type: "application/pdf" })), false);
  });

  it("source no longer hard-codes 1600px document long-edge resize", () => {
    const src = readFileSync(new URL("./enhance-image.ts", import.meta.url), "utf8");
    assert.equal(src.includes("1600"), false);
    assert.match(src, /shouldPassThroughOriginal/);
    assert.match(src, /CLIENT_UPLOAD_HARD_CAP_BYTES/);
  });
});
