import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { validatePhotoOrderConfirmation, type OrderLine } from "./mar-safety";

/** KNMAR02/03 — doctor's-order sources: shared from Kiorly Clinic by patient consent (MedicationOrderShared) or a photo the nurse confirms. */
@Injectable()
export class DoctorOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(o: { id: string; patientId: string; source: string; prescriberName: string; orderedOn: Date; expiresOn: Date; controlled: boolean; linesJson: unknown; status: string; orderVersion: string | null }) {
    return { id: o.id, patientId: o.patientId, source: o.source, prescriberName: o.prescriberName, orderedOn: o.orderedOn.toISOString().slice(0, 10), expiresOn: o.expiresOn.toISOString().slice(0, 10), controlled: o.controlled, lines: o.linesJson, status: o.status, orderVersion: o.orderVersion };
  }

  /** Photo upload path: the nurse confirms prescriber name + date, expiry and the lines (Q10 default). */
  async createFromPhoto(tenantId: string, nurse: JwtUser, input: { patientId: string; prescriberName: string; orderedOn: string; expiresOn: string; controlled?: boolean; lines: OrderLine[]; documentKey?: string }) {
    const err = validatePhotoOrderConfirmation(input);
    if (err) throw new BadRequestException(err);
    const patient = await this.prisma.patient.findFirst({ where: { id: input.patientId, tenantId, deletedAt: null }, select: { id: true } });
    if (!patient) throw new NotFoundException("Patient not found");
    const row = await this.prisma.doctorOrder.create({
      data: { tenantId, patientId: input.patientId, source: "PHOTO_UPLOAD", prescriberName: input.prescriberName.trim(), orderedOn: new Date(input.orderedOn), expiresOn: new Date(input.expiresOn), controlled: input.controlled === true, linesJson: input.lines as unknown as Prisma.InputJsonValue, documentKey: input.documentKey ?? null, confirmedByNurseId: nurse.userId, confirmedAt: new Date() },
    });
    await this.audit.recordEvent({ tenantId, actorId: nurse.userId, clinicId: null, action: "doctor_order.created", resource: "DoctorOrder", resourceId: row.id, metadata: { source: "PHOTO_UPLOAD", controlled: row.controlled } });
    return this.view(row);
  }

  /**
   * Shared path (MedicationOrderShared delivered by Kiorex). Idempotent on orderId; needs the patient's consent token and a signed version + expiry
   * (BR57). The event carries no medicine lines: `lines` come from the secure-link payload the nurse client fetched; they are validated here.
   */
  async ingestShared(tenantId: string, input: { orderId: string; patientId: string; prescriberName: string; orderVersion: number; signedAt: string; expiresAt: string; consentToken: string; controlled?: boolean; lines: OrderLine[] }) {
    if (!input.consentToken?.trim()) throw new ForbiddenException({ code: "CONSENT_REQUIRED", message: "A patient consent token is required" });
    if (!input.orderId || !input.orderVersion || !input.signedAt || !input.expiresAt) throw new BadRequestException("orderId, orderVersion, signedAt and expiresAt are required");
    if (!input.lines?.length) throw new BadRequestException("The order needs at least one line");
    const existing = await this.prisma.doctorOrder.findUnique({ where: { externalRef: input.orderId } });
    if (existing) {
      // A newer signed version replaces the lines; the same version is a no-op (at-least-once delivery).
      if (Number(existing.orderVersion ?? 0) >= input.orderVersion) return this.view(existing);
      const row = await this.prisma.doctorOrder.update({ where: { id: existing.id }, data: { orderVersion: String(input.orderVersion), linesJson: input.lines as unknown as Prisma.InputJsonValue, expiresOn: new Date(input.expiresAt) } });
      return this.view(row);
    }
    const patient = await this.prisma.patient.findFirst({ where: { id: input.patientId, tenantId, deletedAt: null }, select: { id: true } });
    if (!patient) throw new NotFoundException("Patient not found");
    const row = await this.prisma.doctorOrder.create({
      data: { tenantId, patientId: input.patientId, source: "SHARED_KIORLY", prescriberName: input.prescriberName, orderedOn: new Date(input.signedAt), expiresOn: new Date(input.expiresAt), controlled: input.controlled === true, linesJson: input.lines as unknown as Prisma.InputJsonValue, externalRef: input.orderId, orderVersion: String(input.orderVersion) },
    });
    return this.view(row);
  }

  async revoke(tenantId: string, actor: JwtUser, id: string) {
    const o = await this.prisma.doctorOrder.findFirst({ where: { id, tenantId } });
    if (!o) throw new NotFoundException("Order not found");
    if (o.status === "REVOKED") throw new ConflictException({ code: "ORDER_ALREADY_REVOKED", message: "Already revoked" });
    const row = await this.prisma.doctorOrder.update({ where: { id }, data: { status: "REVOKED" } });
    await this.audit.recordEvent({ tenantId, actorId: actor.userId, clinicId: null, action: "doctor_order.revoked", resource: "DoctorOrder", resourceId: id });
    return this.view(row);
  }

  async listForPatient(tenantId: string, patientId: string) {
    const rows = await this.prisma.doctorOrder.findMany({ where: { tenantId, patientId }, orderBy: { createdAt: "desc" }, take: 50 });
    return { items: rows.map((r) => this.view(r)) };
  }
}
