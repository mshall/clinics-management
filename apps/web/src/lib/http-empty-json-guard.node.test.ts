import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("http.ts empty JSON guard", () => {
  const src = readFileSync(new URL("./http.ts", import.meta.url), "utf8");

  it("uses parseSuccessJsonText for success bodies instead of bare res.json()", () => {
    assert.match(src, /parseSuccessJsonText/);
    // Success paths must not call res.json() — that throws on empty 200/201 bodies
    // (e.g. historical reset-clinical), which surfaced as "Unexpected end of JSON input".
    const withoutImports = src.replace(/^import .+$/gm, "");
    assert.equal(
      withoutImports.includes("res.json()"),
      false,
      "http.ts success/error helpers must not call res.json(); use text + parseSuccessJsonText",
    );
  });
});
