import assert from "node:assert/strict";
import { test } from "node:test";
import { MfaService } from "./mfa.service";

test("generates unique recovery codes", () => {
  const svc = new MfaService({} as never, {} as never);
  const a = svc.generateRecoveryCodes(8);
  const b = svc.generateRecoveryCodes(8);
  assert.equal(a.length, 8);
  assert.equal(new Set(a).size, 8);
  assert.notDeepEqual(a, b);
});