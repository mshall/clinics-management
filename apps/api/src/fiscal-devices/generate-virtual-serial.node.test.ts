import assert from "node:assert/strict";
import { test } from "node:test";
import { assertValidFiscalSerial, formatVirtualSerial } from "./generate-virtual-serial";

test("virtual serial format and max length", () => {
  const s = formatVirtualSerial("eg", "clinic-abc123xyz", 1);
  assert.match(s, /^KIORLY-EG-[A-Z0-9]+-01$/);
  assert.ok(s.length <= 30);
});

test("sequence increments change serial suffix", () => {
  const a = formatVirtualSerial("AE", "clinic1", 1);
  const b = formatVirtualSerial("AE", "clinic1", 2);
  assert.notEqual(a, b);
  assert.ok(a.endsWith("-01"));
  assert.ok(b.endsWith("-02"));
});

test("assertValidFiscalSerial rejects lowercase", () => {
  assert.throws(() => assertValidFiscalSerial("bad serial"));
});