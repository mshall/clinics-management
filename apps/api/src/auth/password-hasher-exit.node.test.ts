import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

/**
 * Regression: the worker pool must never keep the process alive. `worker.unref()` called BEFORE `worker.on("message")` was undone by the listener, so any
 * process that had verified one password never exited (`node --test` over all integration files hung after the KCV-201 file).
 */
describe("PasswordHasher worker pool", () => {
  it("a process that hashed and compared a password exits by itself", () => {
    const code = `
      const { passwordHasher } = require("./src/auth/password-hasher.ts");
      (async () => { const h = await passwordHasher.hash("pw", 4); if (!(await passwordHasher.compare("pw", h))) process.exit(3); console.log("DONE"); })();`;
    const r = spawnSync(process.execPath, ["--import", "tsx", "--input-type=commonjs", "-e", code], { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
    assert.equal(r.error, undefined, `process did not exit within 20 s: ${r.error?.message}`);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /DONE/);
  });
});
