import { createHmac } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { kiorexApiBase } from "../marketplace/kiorex-connect.service";
import { normalizeLinkCode } from "../growth/provider-links/link-code";

type Tx = Prisma.TransactionClient;

export interface EvidenceVerdict {
  /** True when the evidence shows a provider touch for THIS organisation that the original decision did not credit. */
  providerLed: boolean;
  source: "MOCK_LOCAL" | "KIOREX" | "UNAVAILABLE";
  decisionRef?: string;
  reason?: string;
}

/** Subset of `Evidence` from kiorex-growth.v1.openapi.json (facts only: decision + ordered touch references). */
export interface KiorexEvidence {
  bookingId: string;
  decision: { id: string; origin: "PROVIDER_LED" | "MARKETPLACE" | "UNATTRIBUTED"; reason: string; policyVersion: string; supersedesId?: string | null };
  touches?: Array<{ id: string; kind: string; winning?: boolean }>;
}

const PROVIDER_TOUCH_KINDS = new Set(["PROVIDER_LINK", "PROVIDER_QR", "WIDGET"]);

/** Pure: does Kiorex evidence say the booking was provider-led? A later decision (supersedesId) or a winning provider touch both count; nothing else does. */
export function evidenceConfirmsProviderLed(ev: KiorexEvidence | null | undefined): boolean {
  if (!ev?.decision) return false;
  if (ev.decision.origin === "PROVIDER_LED") return true;
  return Boolean(ev.touches?.some((t) => t.winning && PROVIDER_TOUCH_KINDS.has(t.kind)));
}

/**
 * Evidence for PROVIDER_LED_EVIDENCE disputes (GRW-P1-D2, ARCH 6.7 rule 3). Mock-first (founder decision 19 Nov 2026): `GROWTH_EVIDENCE_MODE=mock` (default)
 * reads the Clinic's own facts: a booking made through one of the organisation's provider links carries `attributionJson.referralLinkCode`, and that link exists.
 * `real` calls `GET /growth/v1/evidence/{bookingId}` on Kiorex with the shared webhook secret. Auto-approval sits behind `GROWTH_EVIDENCE_DISPUTES` (default on;
 * `off` leaves every such dispute OPEN for a human). Real mode is wired but NOT verified against a live Kiorex (needs NEEDS_HUMAN partner credentials).
 */
@Injectable()
export class AttributionEvidenceService {
  private readonly log = new Logger(AttributionEvidenceService.name);

  get autoApproveEnabled(): boolean {
    return (process.env.GROWTH_EVIDENCE_DISPUTES ?? "on").toLowerCase() !== "off";
  }

  async verdict(tx: Tx, tenantId: string, appointmentId: string): Promise<EvidenceVerdict> {
    const apt = await tx.appointment.findFirst({ where: { id: appointmentId, tenantId }, select: { id: true, externalReference: true, attributionJson: true } });
    if (!apt) return { providerLed: false, source: "UNAVAILABLE", reason: "APPOINTMENT_NOT_FOUND" };
    if ((process.env.GROWTH_EVIDENCE_MODE ?? "mock").toLowerCase() === "real") return this.fromKiorex(apt.externalReference);
    const json = apt.attributionJson && typeof apt.attributionJson === "object" && !Array.isArray(apt.attributionJson) ? (apt.attributionJson as Record<string, unknown>) : {};
    const code = normalizeLinkCode(json.referralLinkCode);
    if (!code) return { providerLed: false, source: "MOCK_LOCAL", reason: "NO_PROVIDER_LINK_ON_BOOKING" };
    const link = await tx.providerReferralLink.findFirst({ where: { code, tenantId }, select: { id: true } });
    return link ? { providerLed: true, source: "MOCK_LOCAL", decisionRef: link.id, reason: "PROVIDER_LINK_ON_BOOKING" } : { providerLed: false, source: "MOCK_LOCAL", reason: "LINK_NOT_FOUND" };
  }

  private async fromKiorex(bookingRef: string | null): Promise<EvidenceVerdict> {
    const base = kiorexApiBase();
    const secret = process.env.KIOREX_OUTBOX_WEBHOOK_SECRET?.trim();
    if (!base || !secret || !bookingRef) return { providerLed: false, source: "UNAVAILABLE", reason: "EVIDENCE_NOT_CONFIGURED" };
    try {
      const path = `/growth/v1/evidence/${encodeURIComponent(bookingRef)}`;
      const ts = Math.floor(Date.now() / 1000);
      const sig = `sha256=${createHmac("sha256", secret).update(`${ts}.`).digest("hex")}`;
      const res = await fetch(`${base}${path}`, { headers: { "X-Kiorly-Timestamp": String(ts), "X-Kiorly-Signature": sig }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { providerLed: false, source: "UNAVAILABLE", reason: `KIOREX_${res.status}` };
      const ev = (await res.json()) as KiorexEvidence;
      return { providerLed: evidenceConfirmsProviderLed(ev), source: "KIOREX", decisionRef: ev.decision?.id, reason: ev.decision?.reason };
    } catch (e) {
      this.log.warn(`evidence fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      return { providerLed: false, source: "UNAVAILABLE", reason: "EVIDENCE_FETCH_FAILED" };
    }
  }
}
