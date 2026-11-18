import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RUNBOOK_REQUIRED_HEADINGS = ["## Symptoms", "## First actions", "## Escalation"] as const;

/** Resolve Docs/runbooks from monorepo root (api cwd is apps/api). */
export function resolveOperationalRunbookPath(runbookDoc: string): string {
  const fromApi = resolve(process.cwd(), "..", "..", "Docs", "runbooks", runbookDoc);
  if (existsSync(fromApi)) return fromApi;
  const fromRoot = resolve(process.cwd(), "Docs", "runbooks", runbookDoc);
  if (existsSync(fromRoot)) return fromRoot;
  return fromApi;
}

export function readOperationalRunbook(runbookDoc: string): string {
  const path = resolveOperationalRunbookPath(runbookDoc);
  if (!existsSync(path)) {
    throw new Error(`Missing runbook: ${runbookDoc} (expected ${path})`);
  }
  return readFileSync(path, "utf8");
}

export function assertRunbookHasRequiredSections(content: string, runbookDoc: string): void {
  for (const heading of RUNBOOK_REQUIRED_HEADINGS) {
    if (!content.includes(heading)) {
      throw new Error(`Runbook ${runbookDoc} missing section ${heading}`);
    }
  }
}