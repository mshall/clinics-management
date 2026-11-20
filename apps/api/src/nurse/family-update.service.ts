import { createHmac, timingSafeEqual } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { MessageChannel } from "@prisma/client";
import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { WhatsAppSendService } from "../messaging/whatsapp-send.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

export const FAMILY_UPDATES_CONSENT_PURPOSE = "FAMILY_UPDATES";
export const FAMILY_UPDATE_TEMPLATE_KEY = "nurse_family_update";
const TTL_MS = 7 * 24 * 3600_000;

function secret(): string {
  const s = process.env.FAMILY_UPDATE_LINK_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (!s) throw new Error("FAMILY_UPDATE_LINK_SECRET (or JWT_SECRET) is required");
  return s;
}

export function signFamilyToken(visitRecordId: string, expiresAtMs: number): string {
  const body = Buffer.from(JSON.stringify({ v: visitRecordId, e: expiresAtMs })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyFamilyToken(token: string, nowMs = Date.now()): string | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { v: string; e: number };
    return p.e > nowMs ? p.v : null;
  } catch {
    return null;
  }
}

/** KNFAM01 — after a visit, a WhatsApp template (NO PHI in the body) links to a summary page for CONSENTED family contacts. */
@Injectable()
export class FamilyUpdateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly whatsapp: WhatsAppSendService,
    private readonly audit: AuditService,
  ) {}

  async sendForVisit(tenantId: string, appointmentId: string, baseUrl = process.env.APP_WEB_URL ?? "http://localhost:5174") {
    await requireFeature(this.flags, tenantId, "nurse.family_updates"); // depends on whatsapp_reminders (registry dependency)
    const rec = await this.prisma.visitRecord.findUnique({ where: { appointmentId } });
    if (!rec || rec.tenantId !== tenantId) throw new NotFoundException("Visit record not found");
    if (rec.status !== "SIGNED") throw new ConflictException({ code: "VISIT_NOT_SIGNED", message: "Send the family update after the visit record is signed" });
    const links = await this.prisma.patientFamilyLink.findMany({ where: { tenantId, fromPatientId: rec.patientId }, include: { toPatient: { select: { id: true, phone: true } } } });
    const link = `${baseUrl.replace(/\/$/, "")}/f/${signFamilyToken(rec.id, Date.now() + TTL_MS)}`;
    const sent: string[] = [];
    const skipped: { patientId: string; reason: string }[] = [];
    for (const l of links) {
      const consent = await this.prisma.messagingConsent.findUnique({ where: { patientId_channel_purpose: { patientId: l.toPatient.id, channel: MessageChannel.WHATSAPP, purpose: FAMILY_UPDATES_CONSENT_PURPOSE } } });
      if (!consent?.granted) {
        skipped.push({ patientId: l.toPatient.id, reason: "NO_CONSENT" });
        continue;
      }
      // The body carries only the link: no patient name, no clinical content (KX-23 KNFAM01).
      await this.whatsapp.sendTemplateForTenant(tenantId, FAMILY_UPDATE_TEMPLATE_KEY, l.toPatient.phone, { link }, { renderedBody: `A home-care visit was completed. Summary: ${link}` });
      sent.push(l.toPatient.id);
    }
    return { sent: sent.length, skipped };
  }

  /** KNFAM01 — family contacts of a patient with the FAMILY_UPDATES WhatsApp consent state (consent is per contact, explicit, default NOT granted). */
  async contactsFor(tenantId: string, patientId: string) {
    const links = await this.prisma.patientFamilyLink.findMany({ where: { tenantId, fromPatientId: patientId }, include: { toPatient: { select: { id: true, firstNameEn: true, lastNameEn: true, phone: true } } } });
    const consents = await this.prisma.messagingConsent.findMany({ where: { tenantId, patientId: { in: links.map((l) => l.toPatient.id) }, channel: MessageChannel.WHATSAPP, purpose: FAMILY_UPDATES_CONSENT_PURPOSE } });
    const byPatient = new Map(consents.map((c) => [c.patientId, c.granted]));
    return { items: links.map((l) => ({ linkId: l.id, relation: l.relation, patientId: l.toPatient.id, name: `${l.toPatient.firstNameEn} ${l.toPatient.lastNameEn}`.trim(), phone: l.toPatient.phone, consentGranted: byPatient.get(l.toPatient.id) === true })) };
  }

  async setConsent(tenantId: string, actorId: string, patientId: string, contactPatientId: string, granted: boolean) {
    const link = await this.prisma.patientFamilyLink.findFirst({ where: { tenantId, fromPatientId: patientId, toPatientId: contactPatientId } });
    if (!link) throw new NotFoundException("Family contact not found");
    await this.prisma.messagingConsent.upsert({
      where: { patientId_channel_purpose: { patientId: contactPatientId, channel: MessageChannel.WHATSAPP, purpose: FAMILY_UPDATES_CONSENT_PURPOSE } },
      create: { tenantId, patientId: contactPatientId, channel: MessageChannel.WHATSAPP, purpose: FAMILY_UPDATES_CONSENT_PURPOSE, granted, source: "staff_ui" },
      update: { granted, source: "staff_ui" },
    });
    await this.audit.recordEvent({ tenantId, actorId, clinicId: null, action: "family_updates.consent_updated", resource: "Patient", resourceId: contactPatientId, metadata: { granted } });
    return { patientId: contactPatientId, consentGranted: granted };
  }

  /** Public summary page data: coarse and clinically minimal (nurse first name, time, tasks done). Never vitals, medicines or the address. */
  async publicSummary(token: string) {
    const id = verifyFamilyToken(token);
    if (!id) throw new NotFoundException("This link is invalid or has expired");
    const rec = await this.prisma.visitRecord.findUnique({ where: { id } });
    if (!rec || rec.status !== "SIGNED") throw new NotFoundException("This link is invalid or has expired");
    const [nurse, appt] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: rec.nurseId }, select: { displayName: true } }),
      this.prisma.appointment.findUnique({ where: { id: rec.appointmentId }, select: { startsAt: true, endsAt: true } }),
    ]);
    const tasks = (Array.isArray(rec.checklistJson) ? (rec.checklistJson as { task?: string; done?: boolean }[]) : []).filter((t) => t.done && t.task).map((t) => t.task);
    return { nurseFirstName: nurse?.displayName.split(/\s+/)[0] ?? null, visitDate: appt?.startsAt.toISOString().slice(0, 10) ?? null, tasksDone: tasks, status: "COMPLETED" as const };
  }
}
