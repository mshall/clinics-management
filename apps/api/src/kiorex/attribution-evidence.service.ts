import { createHash, createHmac, randomBytes } from "node:crypto";
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

/**
 * Request signature of the Kiorex partner endpoints (contracts `signKiorlyRequest`, the same scheme the marketplace API verifies): headers
 * `X-Kiorly-Client-Key`, `-Timestamp` (ms), `-Nonce` (single use), `-Signature` = base64url HMAC-SHA256 over `ts\nnonce\nMETHOD\nfull path\nsha256(body)`.
 * The evidence endpoint (`GET /api/v1/growth/v1/evidence/{bookingId}`) also needs `X-Kiorly-Org-Ref`: only that organisation's bookings answer.
 */
export function signEvidenceRequest(i: { secret: string; clientKey: string; method: string; path: string; orgRef: string; body?: string; now?: number; nonce?: string }): Record<string, string> {
  const ts = String(i.now ?? Date.now());
  const nonce = i.nonce ?? `clinic-${randomBytes(9).toString("base64url")}`;
  const sha = createHash("sha256").update(i.body ?? "").digest("hex");
  const sig = createHmac("sha256", i.secret).update(`${ts}\n${nonce}\n${i.method.toUpperCase()}\n${i.path}\n${sha}`).digest("base64url");
  return { "x-kiorly-client-key": i.clientKey, "x-kiorly-timestamp": ts, "x-kiorly-nonce": nonce, "x-kiorly-signature": sig, "x-kiorly-org-ref": i.orgRef };
}

/** Pure: does Kiorex evidence say the booking was provider-led? A later decision (supersedesId) or a winning provider touch both count; nothing else does. */
export function evidenceConfirmsProviderLed(ev: KiorexEvidence | null | undefined): boolean {
  if (!ev?.decision) return false;
  if (ev.decision.origin === "PROVIDER_LED") return true;
  return Boolean(ev.touches?.some((t) => t.winning && PROVIDER_TOUCH_KINDS.has(t.kind)));
}

/**
 * Evidence for PROVIDER_LED_EVIDENCE disputes (GRW-P1-D2, ARCH 6.7 rule 3). Mock-first (founder decision 19 Nov 2026): `GROWTH_EVIDENCE_MODE=mock` (default)
 * reads the Clinic's own facts: a booking made through one of the organisation's provider links carries `attributionJson.referralLinkCode`, and that link exists.
 * `real` calls `GET /api/v1/growth/v1/evidence/{bookingId}` on Kiorex with the partner request HMAC (shared secret, `X-Kiorly-Org-Ref` = this organisation). Auto-approval sits behind
 * `GROWTH_EVIDENCE_DISPUTES` (default on; `off` leaves every such dispute OPEN for a human). Real mode was verified against a live local Kiorex (`growth-evidence-live.integration.test.ts`, `GROWTH_EVIDENCE_LIVE=1`);
 * production credentials stay NEEDS_HUMAN.
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
    if ((process.env.GROWTH_EVIDENCE_MODE ?? "mock").toLowerCase() === "real") return this.fromKiorex(apt.externalReference, tenantId);
    const json = apt.attributionJson && typeof apt.attributionJson === "object" && !Array.isArray(apt.attributionJson) ? (apt.attributionJson as Record<string, unknown>) : {};
    const code = normalizeLinkCode(json.referralLinkCode);
    if (!code) return { providerLed: false, source: "MOCK_LOCAL", reason: "NO_PROVIDER_LINK_ON_BOOKING" };
    const link = await tx.providerReferralLink.findFirst({ where: { code, tenantId }, select: { id: true } });
    return link ? { providerLed: true, source: "MOCK_LOCAL", decisionRef: link.id, reason: "PROVIDER_LINK_ON_BOOKING" } : { providerLed: false, source: "MOCK_LOCAL", reason: "LINK_NOT_FOUND" };
  }

  private async fromKiorex(bookingRef: string | null, orgRef: string): Promise<EvidenceVerdict> {
    const base = kiorexApiBase();
    const secret = process.env.KIOREX_OUTBOX_WEBHOOK_SECRET?.trim();
    if (!base || !secret || !bookingRef) return { providerLed: false, source: "UNAVAILABLE", reason: "EVIDENCE_NOT_CONFIGURED" };
    try {
      const url = new URL(`${base}/growth/v1/evidence/${encodeURIComponent(bookingRef)}`);
      // the signature covers the FULL request path (`/api/v1/growth/v1/evidence/<id>`), exactly as Kiorex verifies it
      const headers = signEvidenceRequest({ secret, clientKey: process.env.KIOREX_EVIDENCE_CLIENT_KEY?.trim() || process.env.KIOREX_MARKETPLACE_CLIENT_KEY?.trim() || "kx_dev_client", method: "GET", path: url.pathname, orgRef });
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { providerLed: false, source: "UNAVAILABLE", reason: `KIOREX_${res.status}` };
      const ev = (await res.json()) as KiorexEvidence;
      return { providerLed: evidenceConfirmsProviderLed(ev), source: "KIOREX", decisionRef: ev.decision?.id, reason: ev.decision?.reason };
    } catch (e) {
      this.log.warn(`evidence fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      return { providerLed: false, source: "UNAVAILABLE", reason: "EVIDENCE_FETCH_FAILED" };
    }
  }
}
