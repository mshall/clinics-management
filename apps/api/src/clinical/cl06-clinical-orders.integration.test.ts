import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  ClinicalOrderKind,
  ClinicalOrderStatus,
  Gender,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import { MessagingService } from "../messaging/messaging.service";
import { PrismaService } from "../prisma/prisma.service";
import { ClinicalOrdersService, RESULTS_READY_TEMPLATE } from "./clinical-orders.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("CL-06 clinical orders integration", () => {
  const suffix = `${Date.now()}`;
  let tenantId: string;
  let clinicId: string;
  let patientId: string;
  let svc: ClinicalOrdersService;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    tenantId = (
      await prisma.tenant.create({
        data: { name: `CL06 ${suffix}`, deploymentCell: "frankfurt", marketId: market.id, baseCurrency: "EGP" },
      })
    ).id;
    clinicId = (
      await prisma.clinic.create({
        data: {
          tenantId,
          nameEn: "CL06",
          nameAr: "م",
          country: "EG",
          city: "Cairo",
          addressEn: "a",
          addressAr: "ا",
          locationUrl: "https://maps.example/cl06",
          timezone: "Africa/Cairo",
          phone: "201000000406",
          email: `cl06.${suffix}@example.com`,
          licenseNumber: `EG-CL06-${suffix}`,
          defaultCurrency: "EGP",
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: {
          tenantId,
          mrn: `CL06-${suffix}`,
          firstNameEn: "Lab",
          lastNameEn: "Patient",
          gender: Gender.M,
          phone: `2012${suffix.slice(-8)}`,
          homeBranchId: clinicId,
        },
      })
    ).id;
    const prismaSvc = prisma as unknown as PrismaService;
    const messaging = {
      ensureDefaultTemplates: async () => undefined,
      queueMessage: async (...args: unknown[]) => {
        (messaging as { last?: unknown }).last = args;
        return { id: "out" };
      },
    } as unknown as MessagingService;
    svc = new ClinicalOrdersService(prismaSvc, messaging);
    (svc as unknown as { _msg: typeof messaging })._msg = messaging;
  });

  after(async () => {
    if (tenantId) {
      await prisma.outboundMessage.deleteMany({ where: { tenantId } });
      await prisma.clinicalOrderItem.deleteMany({ where: { order: { tenantId } } });
      await prisma.clinicalOrder.deleteMany({ where: { tenantId } });
      await prisma.patient.deleteMany({ where: { tenantId } });
      await prisma.clinic.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("RESULTS_READY queues WhatsApp results_ready template", async () => {
    const order = await svc.create(tenantId, undefined, {
      clinicId,
      patientId,
      kind: ClinicalOrderKind.LAB,
      items: [{ nameEn: "CBC", nameAr: "صورة دم" }],
    });
    const updated = await svc.patch(tenantId, order.id, { status: ClinicalOrderStatus.RESULTS_READY });
    assert.equal(updated.status, ClinicalOrderStatus.RESULTS_READY);

    const msg = (svc as unknown as { _msg: { last?: unknown[] } })._msg.last;
    assert.ok(msg);
    const body = msg![1] as { templateKey: string; toPhone: string };
    assert.equal(body.templateKey, RESULTS_READY_TEMPLATE);
    assert.ok(body.toPhone);

    const row = await prisma.clinicalOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.ok(row.notifiedAt);
  });
});
