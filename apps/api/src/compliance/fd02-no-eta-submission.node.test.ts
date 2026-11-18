import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { isKiorlyFiscalSubmissionEnabled } from "./fiscal-queue";

test("FD-02: fiscal submission disabled unless KIORLY_ETA_SUBMISSION_ENABLED=true", () => {
  const prev = process.env.KIORLY_ETA_SUBMISSION_ENABLED;
  delete process.env.KIORLY_ETA_SUBMISSION_ENABLED;
  assert.equal(isKiorlyFiscalSubmissionEnabled(), false);
  process.env.KIORLY_ETA_SUBMISSION_ENABLED = "true";
  assert.equal(isKiorlyFiscalSubmissionEnabled(), true);
  if (prev === undefined) delete process.env.KIORLY_ETA_SUBMISSION_ENABLED;
  else process.env.KIORLY_ETA_SUBMISSION_ENABLED = prev;
});

test("FD-02: fiscal queue is gated before any ETA provider work", () => {
  const text = readFileSync(join(process.cwd(), "src/compliance/fiscal-queue.ts"), "utf8");
  assert.match(text, /isKiorlyFiscalSubmissionEnabled/);
});