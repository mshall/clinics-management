import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSuccessJsonText } from "./parse-response-json";

describe("parseSuccessJsonText", () => {
  it("returns empty object for empty or whitespace-only bodies", () => {
    assert.deepEqual(parseSuccessJsonText(""), {});
    assert.deepEqual(parseSuccessJsonText("   \n\t"), {});
  });

  it("parses valid JSON objects and arrays", () => {
    assert.deepEqual(parseSuccessJsonText('{"ok":true}'), { ok: true });
    assert.deepEqual(parseSuccessJsonText("[1,2]"), [1, 2]);
  });

  it("throws on malformed JSON (non-empty)", () => {
    assert.throws(() => parseSuccessJsonText("{not-json"), SyntaxError);
  });
});
