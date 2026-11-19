import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MessageChannel, RecordShareScope, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { effectiveRoles, isTenantOwnerPrincipal } from "../common/effective-roles";
import { buildBilingualPdf } from "../billing-platform/bilingual-pdf";
import { RecordShareService } from "../marketplace/record-share.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { OUTBOX_EVENT } from "../messaging/outbox-event-types";
import { MessagingService } from "../messaging/messaging.service";
import { PrismaService } from "../prisma/prisma.service";
import { hashRxToken as hashToken, mintRxVerificationToken, rxPdfUrl, rxTokenTtlDays, rxWebBase } from "./rx-verification-token";
import { prescriptionPdfSections, printedRxItem, toVerificationView, type PrintedRx, type RxVerificationView } from "./rx-print";

export const RX_READY_TEMPLATE_KEY = "prescription_ready";

/** Physicians without another role only reach their own visits (same rule as the encounter screens). */
function isPhysicianOnly(viewer: JwtUser): boolean {
  if (isTenantOwnerPrincipal(viewer)) return false;
  return effectiveRoles(viewer).every((r) => r === UserRole.PHYSICIAN);
}

const medicationInclude = {
  drugProduct: {
    select: {
      brandNameEn: true,
      strength: true,
      defaultSigAr: true,
      ingredients: { select: { ingredient: { select: { nameEn: true } } } },
    },
  },
} as const;

@Injectable()
export class RxShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
    private readonly recordShare: RecordShareService,
    private readonly outbox: OutboxEventService,
  ) {}

  private async loadSignedEncounter(tenantId: string, encounterId: string, viewer?: JwtUser) {
    const enc = await this.prisma.encounter.findFirst({
      where: { id: encounterId, tenantId },
      include: {
        clinic: { select: { nameEn: true, nameAr: true } },
        clinician: { select: { displayName: true } },
        patient: { select: { id: true, firstNameEn: true, lastNameEn: true, phone: true, isSample: true } },
        medications: { include: medicationInclude, orderBy: { createdAt: "asc" } },
      },
    });
    if (!enc) throw new NotFoundException("Encounter not found");
    if (viewer && isPhysicianOnly(viewer) && enc.clinicianId !== viewer.userId) {
      throw new ForbiddenException("You can only work on encounters assigned to you");
    }
    if (!enc.signedAt) {
      throw new ConflictException({
        message: "Sign the visit before printing or sharing a verified prescription",
        errorCode: "RX_NOT_SIGNED",
      });
    }
    if (!enc.medications.length) {
      throw new ConflictException({ message: "This visit has no prescribed medications", errorCode: "RX_EMPTY" });
    }
    return enc;
  }

  private printedFrom(
    enc: Awaited<ReturnType<RxShareService["loadSignedEncounter"]>>,
    verifyUrl: string | null,
  ): PrintedRx {
    return {
      encounterId: enc.id,
      clinicNameEn: enc.clinic.nameEn,
      clinicNameAr: enc.clinic.nameAr?.trim() || null,
      doctorName: enc.clinician.displayName,
      patientName: `${enc.patient.firstNameEn} ${enc.patient.lastNameEn}`.trim(),
      signedAt: enc.signedAt!.toISOString(),
      items: enc.medications.map(printedRxItem),
      verifyUrl,
    };
  }

  private mintToken(tenantId: string, encounterId: string, userId: string | null) {
    return mintRxVerificationToken(this.prisma, tenantId, encounterId, userId);
  }

  verifyUrl(raw: string): string {
    return `${rxWebBase()}/rx/${encodeURIComponent(raw)}`;
  }

  pdfUrl(raw: string): string {
    return rxPdfUrl(raw);
  }

  /** Print model for a signed visit with a fresh verification token (QR target). */
  async printable(tenantId: string, encounterId: string, viewer: JwtUser) {
    const enc = await this.loadSignedEncounter(tenantId, encounterId, viewer);
    const { raw, expiresAt } = await this.mintToken(tenantId, enc.id, viewer.userId);
    await this.audit.recordEvent({
      tenantId,
      actorId: viewer.userId,
      clinicId: enc.clinicId,
      action: "RX_VERIFICATION_ISSUED",
      resource: "Encounter",
      resourceId: enc.id,
      metadata: { patientId: enc.patientId, expiresAt: expiresAt.toISOString(), channel: "PRINT" },
    });
    return { ...this.printedFrom(enc, this.verifyUrl(raw)), expiresAt: expiresAt.toISOString() };
  }

  /** Queue the signed Rx PDF to the patient on WhatsApp (approved template, consent-checked). */
  async sendToPatient(tenantId: string, encounterId: string, viewer: JwtUser) {
    const enc = await this.loadSignedEncounter(tenantId, encounterId, viewer);
    const phone = enc.patient.phone?.trim();
    if (!phone) {
      throw new ConflictException({ message: "Patient has no phone number", errorCode: "RX_NO_PHONE" });
    }
    const { raw, expiresAt } = await this.mintToken(tenantId, enc.id, viewer.userId);
    const verifyUrl = this.verifyUrl(raw);
    const clinic = enc.clinic.nameAr?.trim() || enc.clinic.nameEn;
    const msg = await this.messaging.queueMessage(tenantId, {
      patientId: enc.patientId,
      channel: MessageChannel.WHATSAPP,
      toPhone: phone,
      templateKey: RX_READY_TEMPLATE_KEY,
      body: `${clinic}: ${verifyUrl}`,
      variables: { name: enc.patient.firstNameEn, clinic, link: verifyUrl },
      metadata: {
        kind: "PRESCRIPTION",
        encounterId: enc.id,
        documentLink: this.pdfUrl(raw),
        documentFilename: `prescription-${enc.signedAt!.toISOString().slice(0, 10)}.pdf`,
      },
    });
    await this.audit.recordEvent({
      tenantId,
      actorId: viewer.userId,
      clinicId: enc.clinicId,
      action: "RX_SENT_TO_PATIENT",
      resource: "Encounter",
      resourceId: enc.id,
      metadata: { patientId: enc.patientId, outboundMessageId: msg.id, channel: "WHATSAPP", expiresAt: expiresAt.toISOString() },
    });
    return { outboundMessageId: msg.id, status: msg.status, verifyUrl, expiresAt: expiresAt.toISOString() };
  }

  /**
   * KCV203 — hand the signed e-prescription to Kiorly Pharmacy via Kiorex: emits `PrescriptionIssued` (KX-09 §04)
   * on the outbox. Requires the patient's active PRESCRIPTIONS record-share consent (its token rides in the event).
   * Idempotent per encounter. Real Pharmacy GA is not live: Kiorex receives the event and routes it later (mock-safe).
   */
  async handoffToPharmacy(tenantId: string, encounterId: string, viewer: JwtUser) {
    const enc = await this.loadSignedEncounter(tenantId, encounterId, viewer);
    if (enc.patient.isSample) {
      throw new ConflictException({ message: "Sample patients cannot be handed off", errorCode: "RX_HANDOFF_SAMPLE" });
    }
    const existing = await this.prisma.outboxEvent.findFirst({
      where: { tenantId, type: OUTBOX_EVENT.PRESCRIPTION_ISSUED, aggregateType: "Prescription", aggregateId: enc.id },
      select: { id: true, status: true, createdAt: true },
    });
    if (existing) {
      return { handedOff: true, alreadyHandedOff: true, eventId: existing.id, status: existing.status };
    }
    const consentToken = await this.recordShare.consentTokenFor(tenantId, enc.patientId, RecordShareScope.PRESCRIPTIONS);
    if (!consentToken) {
      throw new ConflictException({
        message: "The patient has not consented to share prescriptions with a pharmacy",
        errorCode: "RX_HANDOFF_NO_CONSENT",
      });
    }
    const issuedAt = enc.signedAt!;
    const eventId = await this.outbox.enqueueEvent({
      tenantId,
      type: OUTBOX_EVENT.PRESCRIPTION_ISSUED,
      aggregateType: "Prescription",
      aggregateId: enc.id,
      payload: {
        prescriptionId: enc.id,
        encounterId: enc.id,
        clinicId: enc.clinicId,
        patientRef: enc.patientId,
        prescriberId: enc.clinicianId,
        consentToken,
        issuedAt: issuedAt.toISOString(),
        items: enc.medications.map((m) => ({
          activeIngredient: m.drugProduct?.ingredients[0]?.ingredient.nameEn ?? m.drugName,
          drugName: m.drugProduct?.brandNameEn ?? m.drugName,
          ...(m.drugProduct?.strength ? { strength: m.drugProduct.strength } : {}),
          ...(m.dosage ? { dose: m.dosage } : {}),
          // The clinic Rx has no pack count; Pharmacy confirms quantity at dispensing (KPRX).
          quantity: 1,
        })),
      },
    });
    await this.audit.recordEvent({
      tenantId,
      actorId: viewer.userId,
      clinicId: enc.clinicId,
      action: "RX_HANDOFF_PHARMACY",
      resource: "Encounter",
      resourceId: enc.id,
      metadata: { patientId: enc.patientId, outboxEventId: eventId, items: enc.medications.length },
    });
    return { handedOff: true, alreadyHandedOff: false, eventId, status: "PENDING" };
  }

  private async resolveToken(raw: string) {
    const row = await this.prisma.prescriptionVerificationToken.findUnique({
      where: { tokenHash: hashToken(raw.trim()) },
    });
    if (!row) throw new NotFoundException("Prescription not found");
    return row;
  }

  /** Public pharmacy check — never discloses more than the printed Rx (patient reduced to initials). */
  async verify(raw: string): Promise<RxVerificationView> {
    const row = await this.resolveToken(raw);
    if (row.revokedAt) return { status: "REVOKED" };
    if (row.expiresAt < new Date()) return { status: "EXPIRED" };
    const enc = await this.loadSignedEncounter(row.tenantId, row.encounterId).catch(() => null);
    if (!enc) return { status: "REVOKED" };
    await this.prisma.prescriptionVerificationToken.update({
      where: { id: row.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
    return toVerificationView(this.printedFrom(enc, null), row.expiresAt);
  }

  /** PDF behind the WhatsApp document link; same content as the printed Rx. */
  async pdf(raw: string): Promise<{ pdf: Buffer; filename: string }> {
    const row = await this.resolveToken(raw);
    if (row.revokedAt || row.expiresAt < new Date()) throw new NotFoundException("Prescription link expired");
    const enc = await this.loadSignedEncounter(row.tenantId, row.encounterId);
    const printed = this.printedFrom(enc, this.verifyUrl(raw));
    return {
      pdf: buildBilingualPdf(prescriptionPdfSections(printed)),
      filename: `prescription-${printed.signedAt.slice(0, 10)}.pdf`,
    };
  }
}

export { rxTokenTtlDays };
