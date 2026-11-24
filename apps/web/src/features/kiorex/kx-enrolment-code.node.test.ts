import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const src = readFileSync(new URL("./kx-enrolment-code.tsx", import.meta.url), "utf8");

describe("enrolment code field (contracts 1.9.0)", () => {
  it("English and Arabic carry the same keys and the Arabic text is Arabic", () => {
    const [en, ar] = src.split('i18n.addResourceBundle("ar"').map((p) => p);
    const keys = (s: string) => [...s.matchAll(/\b([A-Za-z_]+):\s*"/g)].map((m) => m[1]).sort();
    assert.deepEqual(keys(en!), keys(ar!));
    assert.match(ar!, /[؀-ۿ]/);
  });
  it("never persists the code (component state only) and is a logical, RTL-safe layout", () => {
    assert.ok(!/localStorage|sessionStorage/.test(src));
    assert.ok(!/\b(ml|mr|pl|pr)-\d/.test(src));
  });
});
