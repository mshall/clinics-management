import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import { BookingSource } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { KiorexConnectService, kiorexApiBase } from "./kiorex-connect.service";
import { cleanTalkToUs, frontDoorState, leadHeaders, leadSigningSecret, LeadInputError, newLeadNonce, type TalkToUsInput } from "./kiorex-front-door.logic";
import { KIOREX_OVERVIEW_SOURCES } from "./kiorex-overview";

/** Front door of the Kiorex tab: state, privacy-safe funnel markers and the Talk to us lead (all sent signed to Kiorex, no PHI). */
@Injectable()
export class KiorexFrontDoorService {
  private readonly log = new Logger("kiorex-front-door");
  constructor(private readonly prisma: PrismaService, private readonly connect: KiorexConnectService, private readonly audit: AuditService) {}

  private async state(user: JwtUser, clinicId: string) {
    const clinic = await this.connect.loadClinic(user, clinicId);
    const doc = this.connect.doc(clinic.tenant.providerSettings);
    const legacy = !doc; const status = doc?.status ?? "APPROVED";
    const started = !!doc?.wizardStartedAt;
    return { clinic, doc, legacy, status, started, state: frontDoorState({ legacy, status, started }) };
  }

  /** State plus the live-dashboard extras (recent Kiorex bookings, no patient names). */
  async get(user: JwtUser, clinicId: string) {
    const s = await this.state(user, clinicId);
    let recent: Array<{ id: string; startsAt: Date; status: string; channel: string; clinicianName: string }> = [];
    if (s.state === "LIVE" || s.state === "ATTENTION") {
      const rows = await this.prisma.appointment.findMany({
        where: { tenantId: s.clinic.tenantId, clinicId, bookingSource: { in: [...KIOREX_OVERVIEW_SOURCES].filter((x) => x !== BookingSource.CLINIC_LINK) }, patient: { isSample: false } },
        orderBy: { startsAt: "desc" }, take: 8,
        select: { id: true, startsAt: true, status: true, bookingSource: true, clinician: { select: { displayName: true } } },
      });
      recent = rows.map((r) => ({ id: r.id, startsAt: r.startsAt, status: r.status, channel: r.bookingSource === BookingSource.KIOREX_WHATSAPP ? "whatsapp" : "marketplace", clinicianName: r.clinician.displayName }));
    }
    return { clinicId, state: s.state, status: s.status, legacy: s.legacy, started: s.started, interestedAt: s.doc?.interestAt ?? null, leadAt: s.doc?.lead?.at ?? null, recent };
  }

  /** The person opened the Kiorex tab of a standalone organisation: one funnel marker per organisation (best effort, never blocks). */
  async interest(user: JwtUser, clinicId: string) {
    const s = await this.state(user, clinicId);
    if (s.legacy || s.status !== "STANDALONE" || s.doc?.interestAt) return { sent: false };
    const ok = await this.sendFunnel(s.clinic, "INTERESTED");
    if (ok && s.doc) await this.connect.saveDoc(s.clinic.tenantId, { ...s.doc, interestAt: new Date().toISOString() });
    return { sent: ok };
  }

  /** "Start connecting": remember that the wizard was started (the tab then shows the checklist) and mark the funnel. */
  async start(user: JwtUser, clinicId: string) {
    const s = await this.state(user, clinicId);
    if (s.legacy || !s.doc) throw new ConflictException({ code: "ALREADY_CONNECTED", message: "This organisation is already connected" });
    if (s.status === "STANDALONE" && !s.doc.wizardStartedAt) {
      await this.connect.saveDoc(s.clinic.tenantId, { ...s.doc, wizardStartedAt: new Date().toISOString() });
      await this.audit.recordEvent({ tenantId: s.clinic.tenantId, actorId: user.userId, clinicId, action: "kiorex.connect.started", resource: "Tenant", resourceId: s.clinic.tenantId });
      void this.sendFunnel(s.clinic, "STARTED");
    }
    return this.get(user, clinicId);
  }

  /** "Talk to us": a signed lead to Kiorex. Needs consent to be contacted and a phone or e-mail; nothing is sent otherwise. */
  async talk(user: JwtUser, clinicId: string, input: TalkToUsInput) {
    const s = await this.state(user, clinicId);
    if (s.legacy || !s.doc) throw new ConflictException({ code: "ALREADY_CONNECTED", message: "This organisation is already connected" });
    let clean; try { clean = cleanTalkToUs(input ?? {}); } catch (e) { if (e instanceof LeadInputError) throw new BadRequestException({ code: e.code, field: e.field, message: "Check the form" }); throw e; }
    const base = kiorexApiBase(); const secret = leadSigningSecret();
    if (!base || !secret) throw new ConflictException({ code: "KIOREX_NOT_CONFIGURED", message: "Kiorex connection is not configured for this deployment" });
    const t = s.clinic.tenant;
    const body = JSON.stringify({ nonce: newLeadNonce(), kind: t.edition === "NURSE" ? "NURSE" : "CLINIC", orgRef: s.clinic.tenantId, orgName: t.name, ...clean, locale: "en", market: t.market?.code ?? "EG", consent: true });
    let res: Response;
    try { res = await fetch(`${base}/partners/v1/leads`, { method: "POST", headers: leadHeaders(secret, Math.floor(Date.now() / 1000), body), body, signal: AbortSignal.timeout(8000) }); }
    catch { throw new ConflictException({ code: "KIOREX_UNREACHABLE", message: "Kiorex could not be reached; nothing was sent. Try again." }); }
    if (!res.ok) throw new ConflictException({ code: res.status === 429 ? "KIOREX_BUSY" : "KIOREX_REJECTED_REQUEST", status: res.status, message: "Kiorex did not accept the request" });
    await this.connect.saveDoc(s.clinic.tenantId, { ...s.doc, lead: { at: new Date().toISOString() }, interestAt: s.doc.interestAt ?? new Date().toISOString() });
    await this.audit.recordEvent({ tenantId: s.clinic.tenantId, actorId: user.userId, clinicId, action: "kiorex.connect.talk_to_us", resource: "Tenant", resourceId: s.clinic.tenantId });
    return this.get(user, clinicId);
  }

  private async sendFunnel(clinic: { tenantId: string; tenant: { edition: string } }, stage: "INTERESTED" | "STARTED"): Promise<boolean> {
    const base = kiorexApiBase(); const secret = leadSigningSecret(); if (!base || !secret) return false;
    const body = JSON.stringify({ nonce: newLeadNonce(), kind: clinic.tenant.edition === "NURSE" ? "NURSE" : "CLINIC", orgRef: clinic.tenantId, stage });
    try { const r = await fetch(`${base}/partners/v1/funnel`, { method: "POST", headers: leadHeaders(secret, Math.floor(Date.now() / 1000), body), body, signal: AbortSignal.timeout(4000) }); return r.ok; }
    catch (e) { this.log.warn(`funnel marker not sent (${(e as Error).name})`); return false; }
  }
}
