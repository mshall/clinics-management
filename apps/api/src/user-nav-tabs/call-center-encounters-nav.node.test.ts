import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { ENCOUNTERS_MUTATE_ROLES, ENCOUNTERS_VIEW_ROLES } from "./nav-tab-module-roles";
import { defaultNavTabsForRole } from "./nav-tab-keys";

describe("call center encounters nav", () => {
  it("includes encounters with view and mutate role sets", () => {
    const tabs = defaultNavTabsForRole(UserRole.CALL_CENTER);
    assert.ok(tabs.includes("encounters"));
    assert.ok(ENCOUNTERS_VIEW_ROLES.has(UserRole.CALL_CENTER));
    assert.ok(ENCOUNTERS_MUTATE_ROLES.has(UserRole.CALL_CENTER));
  });
});
