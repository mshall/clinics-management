import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEMO_PASSWORD, DEV_GROUPS, DEV_USERS, LEGACY_PASSWORD } from "./dev-test-users-data.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("dev test users are only the documented synthetic personas and passwords", () => {
  assert.ok(DEV_USERS.length >= 20);
  for (const u of DEV_USERS) {
    assert.ok(DEV_GROUPS[u.group], u.email);
    assert.match(u.email, /@(demo\.kiorex\.test|nurse-demo\.kiorly\.test|kiorly\.com|drahmedshall\.com)$/);
    assert.equal(u.password, u.group === "legacy" ? LEGACY_PASSWORD : DEMO_PASSWORD);
  }
  assert.equal(new Set(DEV_USERS.map((u) => u.email)).size, DEV_USERS.length);
});

test("the panel and its credentials are absent from a production build (and present in a development build)", { timeout: 240_000 }, () => {
  execFileSync("node", [path.join(here, "../../scripts/check-no-dev-test-users.mjs")], { stdio: "pipe", cwd: path.join(here, "../..") });
});
