import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, join } from "node:path";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import { roleRequiresMfaEnrollment } from "../auth/privileged-mfa";
import {
  effectiveRoles,
  hasAnyRole,
  hasRole,
  isTenantOwnerPrincipal,
  sanitizeAdditionalRoles,
} from "./effective-roles";

const SRC = join(process.cwd(), "src");

function listTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) listTsFiles(full, out);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}
const ALLOWLIST = new Set([
  "common/effective-roles.ts",
  "common/rbac-role-check.node.test.ts",
]);

test("owner-physician effective roles include both capabilities", () => {
  const principal = {
    role: UserRole.PHYSICIAN,
    additionalRoles: [UserRole.GROUP_ADMIN],
    isTenantOwner: true,
  };
  assert.equal(hasRole(principal, UserRole.PHYSICIAN), true);
  assert.equal(hasRole(principal, UserRole.GROUP_ADMIN), true);
  assert.equal(isTenantOwnerPrincipal(principal), true);
  assert.deepEqual(effectiveRoles(principal), [UserRole.PHYSICIAN, UserRole.GROUP_ADMIN]);
});

test("sanitizeAdditionalRoles drops primary and platform role", () => {
  const cleaned = sanitizeAdditionalRoles(UserRole.PHYSICIAN, [
    UserRole.PHYSICIAN,
    UserRole.GROUP_ADMIN,
    UserRole.PLATFORM_SUPER_ADMIN,
  ]);
  assert.deepEqual(cleaned, [UserRole.GROUP_ADMIN]);
});

test("privileged MFA applies when any held role is privileged", () => {
  const principal = { role: UserRole.PHYSICIAN, additionalRoles: [UserRole.GROUP_ADMIN] };
  const needs = effectiveRoles(principal).some((r) => roleRequiresMfaEnrollment(r));
  assert.equal(needs, true);
});

test("no direct `.role === UserRole` checks outside effective-roles", () => {
  const re = /[\w?]+\.role\s*(!==|===)\s*UserRole\./;
  const violations: string[] = [];
  for (const file of listTsFiles(SRC)) {
    if (file.includes(".node.test.ts")) continue;
    const rel = relative(SRC, file);
    if (ALLOWLIST.has(rel)) continue;
    const text = readFileSync(file, "utf8");
    if (re.test(text)) violations.push(rel);
  }
  assert.equal(
    violations.length,
    0,
    `Use hasRole/hasAnyRole from effective-roles.ts:\n${violations.slice(0, 30).join("\n")}`,
  );
});

test("hasAnyRole replaces OR chains", () => {
  const u = { role: UserRole.RECEPTIONIST, additionalRoles: [UserRole.CALL_CENTER] as UserRole[] };
  assert.equal(
    hasAnyRole(u, [UserRole.GROUP_ADMIN, UserRole.CALL_CENTER]),
    true,
  );
});