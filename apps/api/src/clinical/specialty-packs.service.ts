import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { SPECIALTY_PACK_ADDONS } from "../entitlements/plans-matrix";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SpecialtyPacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  listAddons() {
    return SPECIALTY_PACK_ADDONS.map((a) => ({ ...a }));
  }

  /** Owner purchases a specialty pack → entitlement override true (billed as ADDON later). */
  async purchaseAddon(tenantId: string, actorUserId: string, entitlementKey: string) {
    const pack = SPECIALTY_PACK_ADDONS.find((a) => a.key === entitlementKey);
    if (!pack) throw new BadRequestException("Unknown specialty pack");

    await this.entitlements.setTenantOverride(tenantId, pack.key, true, `Purchased add-on ${pack.key}`, actorUserId, null);
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actorUserId,
        action: "billing.addon_purchased",
        resource: "SpecialtyPack",
        resourceId: pack.key,
        metadata: { monthlyAmount: pack.monthlyAmount, nameEn: pack.nameEn },
      },
    });
    return { entitlement: pack.key, enabled: true, monthlyAmount: pack.monthlyAmount };
  }

  async getDentalChart(tenantId: string, patientId: string) {
    await this.assertPack(tenantId, "pack_dental");
    await this.assertPatient(tenantId, patientId);
    return this.prisma.dentalChartTooth.findMany({
      where: { tenantId, patientId },
      orderBy: { toothFdi: "asc" },
    });
  }

  async upsertDentalTooth(
    tenantId: string,
    patientId: string,
    body: { toothFdi: number; status?: string; planNote?: string; feeAmount?: number },
  ) {
    await this.assertPack(tenantId, "pack_dental");
    await this.assertPatient(tenantId, patientId);
    if (body.toothFdi < 11 || body.toothFdi > 85) throw new BadRequestException("Invalid FDI tooth number");

    return this.prisma.dentalChartTooth.upsert({
      where: { patientId_toothFdi: { patientId, toothFdi: body.toothFdi } },
      create: {
        tenantId,
        patientId,
        toothFdi: body.toothFdi,
        status: body.status ?? "HEALTHY",
        planNote: body.planNote ?? null,
        feeAmount: body.feeAmount != null ? new Prisma.Decimal(body.feeAmount) : null,
      },
      update: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.planNote !== undefined ? { planNote: body.planNote } : {}),
        ...(body.feeAmount !== undefined
          ? { feeAmount: body.feeAmount == null ? null : new Prisma.Decimal(body.feeAmount) }
          : {}),
      },
    });
  }

  async listBeforeAfterPairs(tenantId: string, patientId: string) {
    await this.assertPack(tenantId, "pack_aesthetics");
    await this.assertPatient(tenantId, patientId);
    const photos = await this.prisma.patientClinicalPhoto.findMany({
      where: {
        tenantId,
        patientId,
        kind: { in: ["BEFORE", "AFTER"] },
        pairGroupId: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });
    const byPair = new Map<string, typeof photos>();
    for (const p of photos) {
      const g = p.pairGroupId!;
      const list = byPair.get(g) ?? [];
      list.push(p);
      byPair.set(g, list);
    }
    return [...byPair.entries()].map(([pairGroupId, items]) => ({
      pairGroupId,
      before: items.find((i) => i.kind === "BEFORE") ?? null,
      after: items.find((i) => i.kind === "AFTER") ?? null,
    }));
  }

  async createPhysioPlan(
    tenantId: string,
    body: {
      clinicId: string;
      patientId: string;
      clinicianId: string;
      label: string;
      sessionCount: number;
      notes?: string;
    },
  ) {
    await this.assertPack(tenantId, "pack_physio");
    await this.assertPatient(tenantId, body.patientId);
    if (body.sessionCount < 1 || body.sessionCount > 60) {
      throw new BadRequestException("sessionCount must be 1–60");
    }
    return this.prisma.appointmentSeries.create({
      data: {
        tenantId,
        clinicId: body.clinicId,
        patientId: body.patientId,
        clinicianId: body.clinicianId,
        label: body.notes ? `${body.label} — ${body.notes}` : body.label,
        totalSessions: body.sessionCount,
        cadenceDays: 7,
        startsOn: new Date(),
      },
    });
  }

  private async assertPack(tenantId: string, key: string) {
    if (!(await this.entitlements.isEntitled(tenantId, key))) {
      throw new BadRequestException({
        message: `Specialty pack ${key} is required`,
        errorCode: "PLAN_UPGRADE_REQUIRED",
        entitlement: key,
      });
    }
  }

  private async assertPatient(tenantId: string, patientId: string) {
    const p = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId }, select: { id: true } });
    if (!p) throw new NotFoundException("Patient not found");
  }
}
