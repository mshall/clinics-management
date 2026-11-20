import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { evaluateAdministration, type OrderLine } from "./mar-safety";

export type AdministrationInput = {
  patientId: string;
  doctorOrderId?: string | null;
  visitAppointmentId?: string | null;
  medicineName: string;
  drugProductId?: string | null;
  dose: string;
  route: string;
  administeredAt?: string;
  witnessUserId?: string | null;
  witnessName?: string | null;
};

/**
 * KNMAR01 — medication administration record. SAFETY CONTROL (ADR-025, BR57): this service reads NO feature flags. A MAR row can only exist
 * against an active, unexpired doctor's order for this patient that lists the medicine, and only after the allergy and duplicate checks pass.
 * (The nurse.mar flag only decides whether the STRUCTURED MAR screens are offered; it is enforced on the controller, never here.)
 */
@Injectable()
export class MedicationAdministrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async administer(tenantId: string, nurse: JwtUser, input: AdministrationInput) {
    if (!input.medicineName?.trim() || !input.dose?.trim() || !input.route?.trim()) throw new BadRequestException("medicineName, dose and route are required");
    const administeredAt = input.administeredAt ? new Date(input.administeredAt) : new Date();
    if (Number.isNaN(administeredAt.getTime()) || administeredAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException("administeredAt cannot be in the future");

    const order = input.doctorOrderId ? await this.prisma.doctorOrder.findFirst({ where: { id: input.doctorOrderId, tenantId } }) : null;
    const [allergies, recent, drug] = await Promise.all([
      this.prisma.patientAllergy.findMany({ where: { tenantId, patientId: input.patientId }, select: { code: true, otherComment: true } }),
      this.prisma.medicationAdministration.findMany({ where: { tenantId, patientId: input.patientId, administeredAt: { gte: new Date(administeredAt.getTime() - 48 * 3600_000) } }, select: { medicineName: true, administeredAt: true, doctorOrderId: true } }),
      input.drugProductId ? this.prisma.drugProduct.findUnique({ where: { id: input.drugProductId }, include: { ingredients: { include: { ingredient: true } } } }) : Promise.resolve(null),
    ]);
    const ingredientNames = (drug?.ingredients ?? []).map((i) => (i as { ingredient: { nameEn?: string } }).ingredient?.nameEn ?? "").filter(Boolean);
    const check = evaluateAdministration({
      order: order ? { id: order.id, patientId: order.patientId, status: order.status, expiresOn: order.expiresOn, controlled: order.controlled, lines: order.linesJson as unknown as OrderLine[] } : null,
      entry: { patientId: input.patientId, medicineName: input.medicineName, dose: input.dose, route: input.route, administeredAt, witnessUserId: input.witnessUserId, witnessName: input.witnessName, ingredientNames },
      allergies,
      recent,
    });
    if (!check.ok) {
      await this.audit.recordEvent({ tenantId, actorId: nurse.userId, clinicId: null, action: "mar.refused", resource: "MedicationAdministration", resourceId: null, metadata: { code: check.code, patientId: input.patientId } });
      throw new UnprocessableEntityException({ statusCode: 422, code: check.code, message: check.message });
    }
    const rec = input.visitAppointmentId ? await this.prisma.visitRecord.findUnique({ where: { appointmentId: input.visitAppointmentId } }) : null;
    if (rec && rec.status === "SIGNED") throw new BadRequestException({ code: "VISIT_RECORD_LOCKED", message: "The visit record is signed and locked" });
    const row = await this.prisma.medicationAdministration.create({
      data: {
        tenantId,
        patientId: input.patientId,
        visitRecordId: rec?.id ?? null,
        doctorOrderId: order!.id,
        medicineName: input.medicineName.trim(),
        drugProductId: input.drugProductId ?? null,
        dose: input.dose.trim(),
        route: input.route.trim(),
        administeredAt,
        nurseId: nurse.userId,
        witnessUserId: input.witnessUserId ?? null,
        witnessName: input.witnessName?.trim() || null,
        safetyCheckJson: check.checks as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit.recordEvent({ tenantId, actorId: nurse.userId, clinicId: null, action: "mar.administered", resource: "MedicationAdministration", resourceId: row.id, metadata: { doctorOrderId: order!.id } });
    return { id: row.id, doctorOrderId: row.doctorOrderId, administeredAt: row.administeredAt.toISOString(), checks: check.checks };
  }

  async listForPatient(tenantId: string, patientId: string) {
    const rows = await this.prisma.medicationAdministration.findMany({ where: { tenantId, patientId }, orderBy: { administeredAt: "desc" }, take: 100 });
    if (!rows.length && !(await this.prisma.patient.findFirst({ where: { id: patientId, tenantId }, select: { id: true } }))) throw new NotFoundException("Patient not found");
    return { items: rows.map((r) => ({ id: r.id, medicineName: r.medicineName, dose: r.dose, route: r.route, administeredAt: r.administeredAt.toISOString(), doctorOrderId: r.doctorOrderId, nurseId: r.nurseId })) };
  }
}
