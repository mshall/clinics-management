import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { SYSTEM_TEMPLATE_VERSION, ensureTenantDefaultClinicalFormTemplates } from "./clinical-default-form-templates";
import { LAUNCH_SPECIALTIES, LAUNCH_TEMPLATE_REVIEWS } from "./launch-specialty-templates";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("CL-04 built-in templates in the database", () => {
  let tenantId: string;

  before(async () => {
    await prisma.$connect();
    tenantId = (await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).tenantId;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("every launch specialty has a published, current built-in template for the tenant", async () => {
    await ensureTenantDefaultClinicalFormTemplates(prisma, tenantId);
    const rows = await prisma.clinicalFormTemplate.findMany({
      where: { tenantId, isSystemDefault: true, clinicId: null, specialty: { in: [...LAUNCH_SPECIALTIES] } },
    });
    for (const specialty of LAUNCH_SPECIALTIES) {
      const row = rows.find((r) => r.specialty === specialty);
      assert.ok(row, `missing template for ${specialty}`);
      assert.equal(row.isPublished, true);
      assert.equal(row.systemTemplateVersion, SYSTEM_TEMPLATE_VERSION);
      const ids = JSON.stringify(row.sectionsJson);
      for (const el of LAUNCH_TEMPLATE_REVIEWS[specialty].requiredElements) {
        assert.ok(ids.includes(`"id":"${el}"`), `${specialty} stored template lacks ${el}`);
      }
    }
  });
});
