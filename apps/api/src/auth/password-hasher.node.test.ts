import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import * as bcrypt from "bcryptjs";
import { PasswordHasher } from "./password-hasher";

describe("PasswordHasher (bcrypt off the event loop)", () => {
  const h = new PasswordHasher(2);
  after(async () => { await h.close(); });
  const hash = bcrypt.hashSync("demo", 10);

  it("compares and hashes like bcryptjs, rejects empty/invalid hashes without throwing", async () => {
    assert.equal(await h.compare("demo", hash), true);
    assert.equal(await h.compare("nope", hash), false);
    assert.equal(await h.compare("demo", null), false);
    assert.equal(await h.compare("demo", "not-a-hash"), false);
    assert.equal(bcrypt.compareSync("s3cret!", await h.hash("s3cret!", 4)), true);
  });

  it("regression: a burst of 12 logins does not stall the event loop (sync compare blocked it ~50 ms each, ~600 ms in total)", async () => {
    let worst = 0; let last = Date.now();
    const timer = setInterval(() => { const now = Date.now(); worst = Math.max(worst, now - last - 10); last = now; }, 10);
    const res = await Promise.all(Array.from({ length: 12 }, () => h.compare("demo", hash)));
    clearInterval(timer);
    assert.ok(res.every(Boolean));
    assert.ok(worst < 120, `event loop was blocked for ${worst} ms`);
  });
});
