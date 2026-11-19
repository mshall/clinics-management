import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MessageChannel, UserRole } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { effectiveRoles, isTenantOwnerPrincipal } from "../common/effective-roles";
import { buildBilingualPdf } from "../billing-platform/bilingual-pdf";
import { MessagingService } from "../messaging/messaging.service";
import { PrismaService } from "../prisma/prisma.service";
import { prescriptionPdfSections, printedRxItem, toVerificationView, type PrintedRx, type RxVerificationView } from "./rx-print";

export const RX_READY_TEMPLATE_KEY = "prescription_ready";
const DEFAULT_TOKEN_TTL_DAYS = 14;

/** Physicians without another role only reach their own visits (same rule as the encounter screens). */
function isPhysicianOnly(viewer: JwtUser): boolean {
  if (isTenantOwnerPrincipal(viewer)) return false;
  return effectiveRoles(viewer).every((r) => r === UserRole.PHYSICIAN);
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function webBase(): string {
  return (process.env.APP_WEB_URL?.trim() || "http://localhost:5173").replace(/\/$/, "");
}

/** Pack `clinicalConfig.rxVerification.tokenTtlDays`; code default 14 days. */
export function rxTokenTtlDays(clinicalConfig: unknown): number {
  const cfg = clinicalConfig && typeof clinicalConfig === "object" ? (clinicalConfig as Record<string, unknown>) : {};
  const rx = cfg.rxVerification && typeof cfg.rxVerification === "object" ? (cfg.rxVerification as Record<string, unknown>) : {};
  const days = Number(rx.tokenTtlDays);
  return Number.isFinite(days) && days >= 1 && days <= 90 ? Math.floor(days) : DEFAULT_TOKEN_TTL_DAYS;
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

  private async mintToken(tenantId: string, encounterId: string, userId: string | null) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { market: { select: { clinicalConfig: true } } },
    });
    const ttlDays = rxTokenTtlDays(tenant?.market?.clinicalConfig);
    const raw = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
    await this.prisma.prescriptionVerificationToken.create({
      data: { tenantId, encounterId, tokenHash: hashToken(raw), expiresAt, createdByUserId: userId },
    });
    return { raw, expiresAt };
  }

  verifyUrl(raw: string): string {
    return `${webBase()}/rx/${encodeURIComponent(raw)}`;
  }

  pdfUrl(raw: string): string {
    return `${webBase()}/api/v1/public/rx/verify/${encodeURIComponent(raw)}/pdf`;
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
