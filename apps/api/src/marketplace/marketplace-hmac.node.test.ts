import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sha256BodyHex } from "./marketplace-hmac";
import { marketplaceSignedBody } from "./marketplace-hmac";

const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("KX-09 marketplace HMAC body bytes", () => {
  it("bodyless GET/DELETE (Express parses to {}) is signed as the empty body, per kiorex-contracts vectors", () => {
    assert.equal(sha256BodyHex(marketplaceSignedBody(undefined, {})), EMPTY_SHA);
    assert.equal(sha256BodyHex(marketplaceSignedBody(Buffer.alloc(0), {})), EMPTY_SHA);
    assert.equal(sha256BodyHex(marketplaceSignedBody(undefined, undefined)), EMPTY_SHA);
  });
  it("uses the raw bytes when present and falls back to JSON of a non-empty parsed body", () => {
    const raw = Buffer.from('{"a": 1}');
    assert.equal(marketplaceSignedBody(raw, { a: 1 }), raw);
    assert.equal(marketplaceSignedBody(undefined, { a: 1 })?.toString(), '{"a":1}');
  });
});
