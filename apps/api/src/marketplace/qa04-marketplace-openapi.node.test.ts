import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SPEC_PATH = join(process.cwd(), "openapi", "marketplace.openapi.json");

const IMPLEMENTED_OPERATIONS = [
  "marketplaceAuthVerify",
  "marketplaceListClinics",
  "marketplaceListProviders",
  "marketplaceListPhysicians",
  "marketplaceListSlots",
  "marketplaceAvailability",
  "marketplaceBookAppointment",
  "marketplaceGetAppointment",
  "marketplaceCancelAppointment",
] as const;

describe("QA-04 marketplace OpenAPI contract", () => {
  it("spec defines every KX-01 marketplace operation", () => {
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      info: { title: string };
      paths: Record<string, Record<string, { operationId?: string }>>;
    };
  const operationIds: string[] = [];
  for (const pathItem of Object.values(spec.paths)) {
    for (const op of Object.values(pathItem)) {
      if (op?.operationId) operationIds.push(op.operationId);
    }
  }
  for (const id of IMPLEMENTED_OPERATIONS) {
    assert.ok(operationIds.includes(id), `missing operationId ${id} in marketplace.openapi.json`);
  }
  assert.equal(spec.info.title, "Kiorex Marketplace API");
  });
});