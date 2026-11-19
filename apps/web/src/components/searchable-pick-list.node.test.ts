import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("SearchablePickList mobile scroll", () => {
  it("list panel allows vertical pan and does not preventDefault on touch pointerdown", () => {
    const src = readFileSync(join(here, "searchable-pick-list.tsx"), "utf8");
    assert.match(src, /touch-action:pan-y/);
    assert.match(src, /t\.closest\(PICK_LIST_PANEL_SELECTOR\)/);
    assert.doesNotMatch(src, /onPointerDown=\{selectOption/);
    assert.match(src, /Click-only selection/);
  });
});
