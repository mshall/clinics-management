import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { containsNul, RejectNulBytesPipe } from "./reject-nul-bytes.pipe";

describe("EDGE-48 NUL bytes never reach PostgreSQL", () => {
  it("finds U+0000 in strings, nested objects, arrays and keys, and nothing else", () => {
    assert.equal(containsNul("a\u0000b"), true);
    assert.equal(containsNul({ a: [{ b: "x\u0000" }] }), true);
    assert.equal(containsNul({ "k\u0000": 1 }), true);
    for (const ok of ["", "abc", "🙂​‮", "ملاحظة ١٢٣", 5, null, undefined, [1, "a"], { a: { b: [true] } }, Buffer.from([0, 1])]) assert.equal(containsNul(ok), false);
  });
  it("the pipe answers 400 INVALID_CHARACTER for query, param and body, and ignores custom decorators", () => {
    const pipe = new RejectNulBytesPipe();
    for (const type of ["query", "param", "body"] as const) assert.throws(() => pipe.transform("x\u0000", { type }), (e: any) => e.getStatus() === 400 && e.getResponse().code === "INVALID_CHARACTER");
    assert.equal(pipe.transform("clean", { type: "query" }), "clean");
    assert.equal(pipe.transform("x\u0000", { type: "custom" }), "x\u0000");
  });
});
