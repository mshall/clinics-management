import assert from "node:assert/strict";
import test from "node:test";
import { MAX_PAGE_SIZE, parsePageParams } from "./pagination";

test("parsePageParams caps pageSize at MAX_PAGE_SIZE", () => {
  const { pageSize, skip } = parsePageParams("1", "10000");
  assert.equal(pageSize, MAX_PAGE_SIZE);
  assert.equal(skip, 0);
});

test("parsePageParams normalizes invalid input", () => {
  const { page, pageSize } = parsePageParams("0", "abc");
  assert.equal(page, 1);
  assert.equal(pageSize, 10);
});
