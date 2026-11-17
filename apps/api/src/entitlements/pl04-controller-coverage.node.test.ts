import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { CONTROLLER_ENTITLEMENT_POLICIES } from "./plans-matrix";

const SRC = join(process.cwd(), "src");

function listControllerFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      listControllerFiles(full, out);
    } else if (name.endsWith(".controller.ts")) {
      out.push(relative(SRC, full).replace(/\\/g, "/"));
    }
  }
  return out;
}

test("every API controller is registered in the PL-04 entitlement policy map", () => {
  const controllers = listControllerFiles(SRC).sort();
  const registered = new Set(Object.keys(CONTROLLER_ENTITLEMENT_POLICIES));
  for (const file of controllers) {
    assert.ok(registered.has(file), `Missing CONTROLLER_ENTITLEMENT_POLICIES entry for ${file}`);
  }
  for (const key of registered) {
    assert.ok(controllers.includes(key), `Stale policy entry (no controller): ${key}`);
  }
});

test("controllers match open / gated / mixed entitlement decoration rules", () => {
  for (const [rel, policy] of Object.entries(CONTROLLER_ENTITLEMENT_POLICIES)) {
    const content = readFileSync(join(SRC, rel), "utf8");
    const decorators = content.match(/@RequiresEntitlement\(["']([^"']+)["']\)/g) ?? [];

    if (policy.kind === "platform" || policy.kind === "webhook") continue;

    if (policy.kind === "open") {
      assert.equal(decorators.length, 0, `${rel} is open but declares @RequiresEntitlement`);
      continue;
    }

    if (policy.kind === "gated") {
      assert.ok(content.includes("EntitlementGuard"), `${rel} must use EntitlementGuard`);
      assert.ok(decorators.length >= 1, `${rel} must declare @RequiresEntitlement`);
      const first = decorators[0]!.match(/@RequiresEntitlement\(["']([^"']+)["']\)/);
      assert.equal(first?.[1], policy.entitlement, `${rel} entitlement mismatch`);
      continue;
    }

    if (policy.kind === "mixed") {
      assert.ok(decorators.length >= policy.minDecorators, `${rel} needs at least ${policy.minDecorators} entitlement decorators`);
      assert.ok(
        decorators.some(
          (d: string) => d.includes(`"${policy.entitlement}"`) || d.includes(`'${policy.entitlement}'`),
        ),
        `${rel} must gate ${policy.entitlement}`,
      );
    }
  }
});