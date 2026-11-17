import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { MONEY_AUDIT_COVERAGE } from "./money-audit-coverage.registry";

const SRC = join(process.cwd(), "src");

function sliceMethodBody(source: string, method: string): string {
  const sig = new RegExp(`(?:private\\s+)?async\\s+${method}\\s*\\(`, "m");
  const m = sig.exec(source);
  if (!m) throw new Error(`Method ${method} not found`);
  let i = m.index + m[0].length;
  let depth = 1;
  for (; i < source.length && depth > 0; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
  }
  while (i < source.length && /\s/.test(source[i]!)) i++;
  if (source[i] === ":") {
    i++;
    while (i < source.length) {
      if (source[i] === "{") {
        const open = i;
        let d = 0;
        for (; i < source.length; i++) {
          if (source[i] === "{") d++;
          else if (source[i] === "}") {
            d--;
            if (d === 0) {
              i++;
              break;
            }
          }
        }
        const lit = source.slice(open, i);
        if (/^\{\s*(ok:\s*true|preview:|trialEndsAt:)/.test(lit)) continue;
        i = open;
        break;
      }
      if (source[i] === "{") break;
      i++;
    }
  }
  while (i < source.length && source[i] !== "{") i++;
  if (i >= source.length) throw new Error(`Method body for ${method} not found`);
  const start = i;
  let bodyDepth = 0;
  for (let j = start; j < source.length; j++) {
    const ch = source[j];
    if (ch === "{") bodyDepth++;
    else if (ch === "}") {
      bodyDepth--;
      if (bodyDepth === 0) {
        return source.slice(start, j + 1);
      }
    }
  }
  throw new Error(`Unclosed body for ${method}`);
}

function assertAuditInMethod(
  relFile: string,
  method: string,
  action: string,
  delegatedAudit?: boolean,
): void {
  const source = readFileSync(join(SRC, relFile), "utf8");
  const body = sliceMethodBody(source, method);
  if (delegatedAudit) {
    assert.ok(
      body.includes(`"${action}"`) || body.includes(`'${action}'`),
      `${relFile}#${method} must delegate audit action ${action}`,
    );
    return;
  }
  assert.match(body, /auditLog\.create\s*\(/, `${relFile}#${method} must call auditLog.create`);
  if (action.endsWith(".")) {
    const prefix = action.slice(0, -1);
    const ok =
      body.includes(`"${prefix}.`) ||
      body.includes(`'${prefix}.`) ||
      body.includes("action,") ||
      body.includes("action: action");
    assert.ok(ok, `${relFile}#${method} must record audit action under prefix ${prefix}.`);
  } else {
    const ok =
      body.includes(`"${action}"`) ||
      body.includes(`'${action}'`) ||
      (action === "subscription.trial_ending_notice" && body.includes("subscription.trial_ending_notice"));
    assert.ok(ok, `${relFile}#${method} must use audit action ${action}`);
  }
}

describe("SC-07 money-affecting service audit coverage", () => {
  for (const entry of MONEY_AUDIT_COVERAGE) {
    it(`${entry.file} → ${entry.method} writes ${entry.action}`, () => {
      assertAuditInMethod(entry.file, entry.method, entry.action, entry.delegatedAudit);
    });
  }
});