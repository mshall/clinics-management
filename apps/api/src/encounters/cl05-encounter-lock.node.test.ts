import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { EncounterStatus } from "@prisma/client";
import { autoLockHours, encounterLockAt, isEncounterLocked } from "../common/encounter-lock";

const SRC = join(__dirname, "..");

/** Writers that never touch a signed note, each with the reason it is exempt. */
const EXEMPT: Record<string, string> = {
  "common/encounter-lock.ts": "the lock helper itself",
  "front-desk/ensure-draft-encounter-on-check-in.ts": "creates a new DRAFT encounter",
  "front-desk/appointment-check-in-revert.ts": "deletes DRAFT encounters only",
  "common/visit-fee-ledger.ts": "updates DRAFT/AMENDED encounters only (visit fee, not the note)",
  "clinic-ai/clinic-ai.service.ts": "scribe approval skips FINALIZED encounters",
  "patients/patient-360.service.ts": "duplicate-patient merge reassigns ownership; note content unchanged, merge is audited",
  "staging/sales-demo-reset.ts": "staging demo reset wipes the whole tenant",
  "storage/processing/document-processing.service.ts":
    "async quality pipeline updates size/sha/thumbs only; upload endpoints already guard the lock",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts") && !p.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const WRITE_RE = /\.(encounter|diagnosis|encounterMedication|encounterDocument)\.(update|updateMany|delete|deleteMany|create|createMany|upsert)\(/;
const GUARD_RE = /assertEncounterWritable|ensureEditableEncounter|ensureEditable\(|syncEncounterLock/;

describe("CL-05 encounter auto-lock", () => {
  const finalizedAt = new Date("2026-11-01T08:00:00Z");
  const signed = { status: EncounterStatus.FINALIZED, finalizedAt, noteLockedAt: null };

  it("locks a signed note after the tenant window and not before", () => {
    assert.equal(encounterLockAt(signed, 72)?.toISOString(), "2026-11-04T08:00:00.000Z");
    assert.equal(isEncounterLocked(signed, 72, new Date("2026-11-04T07:59:59Z")), false);
    assert.equal(isEncounterLocked(signed, 72, new Date("2026-11-04T08:00:00Z")), true);
    assert.equal(isEncounterLocked(signed, 0, finalizedAt), true, "0h window locks on signature");
  });

  it("drafts and amended notes never lock; an explicit lock wins", () => {
    const now = new Date("2030-01-01T00:00:00Z");
    assert.equal(isEncounterLocked({ ...signed, status: EncounterStatus.DRAFT }, 72, now), false);
    assert.equal(isEncounterLocked({ ...signed, status: EncounterStatus.AMENDED }, 72, now), false);
    const explicit = new Date("2026-11-02T00:00:00Z");
    assert.equal(encounterLockAt({ ...signed, noteLockedAt: explicit }, 72)?.getTime(), explicit.getTime());
  });

  it("falls back to 72h when the tenant has no valid window", () => {
    assert.equal(autoLockHours(null), 72);
    assert.equal(autoLockHours(-1), 72);
    assert.equal(autoLockHours(24), 24);
  });

  it("every code path that writes encounter clinical rows checks the lock (or is an exempt draft-only path)", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).split("\\").join("/");
      const src = readFileSync(file, "utf8");
      if (!WRITE_RE.test(src) || EXEMPT[rel]) continue;
      if (!GUARD_RE.test(src)) offenders.push(rel);
    }
    assert.deepEqual(offenders, [], `add assertEncounterWritable() or an EXEMPT entry with a reason: ${offenders.join(", ")}`);
  });
});
