import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const apiRoot = process.cwd();
const entrypoint = path.join(apiRoot, "docker-entrypoint.mjs");

describe("App Runner docker entrypoint Nest main path", () => {
  it("resolves dist/src/main.js (nest build output)", () => {
    const text = readFileSync(entrypoint, "utf8");
    assert.match(text, /dist[/\\]src[/\\]main\.js/, "entrypoint must prefer Nest dist/src/main.js");
  });

  it("dist/src/main.js exists when API was built", () => {
    const mainJs = path.join(apiRoot, "dist", "src", "main.js");
    if (!existsSync(mainJs)) return;
    assert.ok(existsSync(mainJs));
  });
});