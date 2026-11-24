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
test("recovery codes are checked on the worker pool and a used code is consumed once", async () => {
  const { passwordHasher } = await import("./password-hasher");
  const hash = await passwordHasher.hash("ABCD-1234", 4);
  let stored: string[] = [hash];
  const prisma = { user: { findUnique: async () => ({ mfaRecoveryHashes: stored }), update: async ({ data }: { data: { mfaRecoveryHashes: string[] } }) => { stored = data.mfaRecoveryHashes; } } };
  const svc = new MfaService(prisma as never, {} as never);
  assert.equal(await svc.consumeRecoveryCode("u1", "nope"), false);
  assert.equal(await svc.consumeRecoveryCode("u1", " abcd-1234 "), true);
  assert.equal(stored.length, 0);
  assert.equal(await svc.consumeRecoveryCode("u1", "ABCD-1234"), false);
  await passwordHasher.close();
});

test("no synchronous bcrypt call is left in the MFA and Kiorex sign-in services", async () => {
  const { readFileSync } = await import("node:fs"); const { join } = await import("node:path");
  for (const f of ["mfa.service.ts", "kiorex-oidc.service.ts"]) assert.doesNotMatch(readFileSync(join(__dirname, f), "utf8"), /compareSync|hashSync/, f);
});
