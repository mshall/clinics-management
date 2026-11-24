import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { IsNumberLike, BoundedObjectPipe, boundedJsonProblem, IsBoundedJson } from "./bounded-json";
import { AppValidationPipe, Lenient } from "./lenient-dto";

const deep = (n: number): unknown => (n === 0 ? {} : { a: deep(n - 1) });
describe("boundedJsonProblem", () => {
  it("accepts ordinary JSON", () => assert.equal(boundedJsonProblem({ a: [1, 2, { b: "x" }], c: null, d: true }), null));
  it("refuses depth, key count, string length, size, prototype keys and non-finite numbers", () => {
    assert.match(boundedJsonProblem(deep(30)) ?? "", /deeper/);
    assert.match(boundedJsonProblem(Object.fromEntries(Array.from({ length: 2500 }, (_, i) => [`k${i}`, i]))) ?? "", /more than/);
    assert.match(boundedJsonProblem({ s: "x".repeat(30_000) }) ?? "", /longer/);
    assert.match(boundedJsonProblem({ s: "x".repeat(15_000), t: "y".repeat(15_000) }, { maxBytes: 20_000 }) ?? "", /larger/);
    assert.match(boundedJsonProblem(JSON.parse('{"__proto__":{"admin":true}}')) ?? "", /not allowed/);
    assert.match(boundedJsonProblem({ n: Infinity }) ?? "", /finite/);
  });
});
describe("BoundedObjectPipe", () => {
  const pipe = new BoundedObjectPipe({ maxDepth: 4 });
  it("passes an object through unchanged and treats a missing body as empty", () => { assert.deepEqual(pipe.transform({ a: 1 }), { a: 1 }); assert.deepEqual(pipe.transform(undefined), {}); });
  it("rejects arrays, strings and over-deep objects with 400", () => {
    for (const bad of [[], "str", 7, deep(9)]) assert.throws(() => pipe.transform(bad), BadRequestException);
  });
});
describe("IsNumberLike / IsBoundedJson in a DTO", () => {
  @Lenient() class Sample { @IsNumberLike({ min: 0, max: 100 }) n!: unknown; @IsBoundedJson({ maxDepth: 3 }, { allowArray: false }) j!: unknown }
  const pipe = new AppValidationPipe();
  const run = (v: unknown) => pipe.transform(v, { type: "body", metatype: Sample });
  it("accepts numbers and numeric strings in range", async () => { await run({ n: 5, j: { a: 1 } }); await run({ n: "5.5", j: {} }); });
  it("rejects out of range, non-numeric, arrays and deep JSON", async () => {
    for (const bad of [{ n: 101, j: {} }, { n: "abc", j: {} }, { n: "", j: {} }, { n: 1, j: [] }, { n: 1, j: deep(8) }, { n: 1 }]) await assert.rejects(async () => run(bad), BadRequestException);
  });
});
