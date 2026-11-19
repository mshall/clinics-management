import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(__dirname, "../../../..");

describe("SC-08 backup restore drill", () => {
  it("drill report is stored in Docs with RPO/RTO columns", () => {
    const report = join(ROOT, "Docs/SC08_BACKUP_RESTORE_DRILL_REPORT.md");
    assert.equal(existsSync(report), true);
    const body = readFileSync(report, "utf8");
    assert.match(body, /\bRPO\b/);
    assert.match(body, /\bRTO\b/);
    assert.match(body, /eu-central-1/);
  });

  it("dry-run script passes without touching databases", () => {
    const script = join(ROOT, "scripts/backup-restore-drill.sh");
    assert.equal(existsSync(script), true);
    const out = execFileSync("bash", [script, "--mode", "dry-run"], { encoding: "utf8" });
    assert.match(out, /PASS: SC-08 dry-run/);
  });

  it("NH-018 tracks live Frankfurt restore", () => {
    const nh = readFileSync(join(ROOT, "Docs/KIORLY_NEEDS_HUMAN.md"), "utf8");
    assert.match(nh, /NH-018/);
    assert.match(nh, /Backup restore|restore drill/i);
  });

  it("infra pins 35-day automated backups in Frankfurt cell", () => {
    const stack = readFileSync(join(ROOT, "infra/src/kiorly-clinics-management-stack.ts"), "utf8");
    assert.match(stack, /backupRetention:\s*cdk\.Duration\.days\(35\)/);
  });
});
