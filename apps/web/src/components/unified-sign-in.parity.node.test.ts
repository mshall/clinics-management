import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The unified sign-in card is a VERBATIM copy of kiorex-account/packages/unified-login/unified-sign-in.tsx. Edit the canonical file and run scripts/sync-unified-login.sh in the workspace. */
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "unified-sign-in.tsx"), "utf8");
test("unified sign-in copy matches the recorded canonical hash", () => {
  const recorded = readFileSync(join(here, "unified-sign-in.sha256"), "utf8").trim();
  assert.equal(createHash("sha256").update(src).digest("hex"), recorded, "the copy diverged from the canonical card: run scripts/sync-unified-login.sh");
});
test("EN and AR strings have the same keys and every error code is covered in both", () => {
  const block = (lang: string) => src.slice(src.indexOf(`  ${lang}: {`), src.indexOf("errors: {", src.indexOf(`  ${lang}: {`)));
  const keys = (b: string) => [...b.matchAll(/^    (\w+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys(block("en")), keys(block("ar")));
  const codes = (lang: string) => [...src.slice(src.indexOf("errors: {", src.indexOf(`  ${lang}: {`))).split("},")[0]!.matchAll(/^      ([A-Z_]+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(codes("en"), codes("ar"));
});
