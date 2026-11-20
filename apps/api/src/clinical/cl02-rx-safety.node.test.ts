import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allergyMatchesIngredients } from "./allergy-ingredient-map";
import { normalizeRxSeverity, severityRequiresOverride } from "./rx-safety-severity";
import { createPrismaClient } from "../prisma/create-prisma-client";

describe("CL-02 Rx safety", () => {
  it("major and contraindicated severities require override", () => {
    assert.equal(severityRequiresOverride("major"), true);
    assert.equal(severityRequiresOverride("contraindicated"), true);
    assert.equal(severityRequiresOverride("moderate"), false);
    assert.equal(severityRequiresOverride("minor"), false);
  });

  it("normalizes legacy high severity to major", () => {
    assert.equal(normalizeRxSeverity("high"), "major");
  });

  it("allergy matches resolved ingredients not brand names alone", () => {
    assert.equal(allergyMatchesIngredients("AMOXICILLIN", ["amoxicillin", "clavulanate"], null), true);
    assert.equal(allergyMatchesIngredients("AMOXICILLIN", ["paracetamol"], null), false);
  });

  it("free-text unresolved items are flagged unavailable in checkRx", async () => {
    const { RxSafetyCheckService } = await import("./rx-safety-check.service");
    const { PrismaClient } = await import("@prisma/client");
    const prisma = createPrismaClient();
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    const patient = await prisma.patient.findFirstOrThrow({ where: { tenantId: clinic.tenantId } });
    const svc = new RxSafetyCheckService(prisma as never);
    const result = await svc.checkRx(clinic.tenantId, patient.id, [{ drugName: "Random Free Text 999" }]);
    assert.ok(
      result.alerts.some((a) => a.kind === "unavailable"),
      "expected safety check unavailable for free-text drug",
    );
    await prisma.$disconnect();
  });
});