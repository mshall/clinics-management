import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { decryptClinicianNationalId as openField, encryptClinicianNationalId as sealField } from "../clinician-verification/field-crypto";
import { ListingStatus, Prisma, VerificationStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { FeatureFlagsService, flagOn } from "../feature-flags/feature-flags-public";
import { effectiveVerificationStatus } from "../clinician-verification/profession-verification";
import { resolveProfessionPack } from "../scope-of-practice/profession-pack";
import { effectiveProfession } from "../scope-of-practice/scope-of-practice.service";
import { KiorexCommissionService } from "../kiorex/kiorex-commission.service";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeWeekJson } from "../scheduling/availability-week-schema";
import { KIOREX_TERMS_VERSION, canRequestGoLive, computeConnectSteps, connectProgressPct, type ConnectDoctorFacts, type ConnectStatus } from "./kiorex-connect.logic";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { PROVIDER_PROFILE_COMPLETENESS_MIN, parseProviderProfileJson, providerProfileCompletenessPercent } from "./provider-profile-schema";

interface ConnectDoc {
  status: ConnectStatus;
  startedAt?: string;
  consent?: { at: string; userId: string; termsVersion: string; feeAcknowledged: boolean; feeSnapshot: unknown };
  request?: { id: string; token: string; submittedAt: string };
  /** AES-GCM sealed (field-crypto) intake key Kiorex issued once at the first request; signs every later request. The enrolment code itself is never stored. */
  intakeKeyEnc?: string;
  kiorex?: { status: string; reason?: string | null; at: string };
  /** Front door (ADR-040): the wizard was started; the Kiorex tab was viewed while standalone; a Talk to us lead was sent. */
  wizardStartedAt?: string;
  interestAt?: string;
  lead?: { at: string };
}

/** Kiorex API base for the signed connection request: derived from the existing outbox webhook URL (no new secret, PHI-free body). */
export function kiorexApiBase(env: Record<string, string | undefined> = process.env): string | null {
  const url = (env.KIOREX_API_BASE_URL ?? env.KIOREX_OUTBOX_WEBHOOK_URL ?? "").trim();
  if (!url) return null;
  return url.replace(/\/+$/, "").replace(/\/webhooks\/kiorly$/, "");
}

/** `sha256=HMAC(key, "<ts>.<rawBody>")` as the outbox webhook is signed; `key` for the intake is hex(sha256(secret)), see deriveIntakeSigningKey. */
export function signConnectBody(secret: string, ts: number, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;
}

/** Intake auth (kiorex-contracts 1.9.0): the first request is signed with the one-time enrolment code from Kiorex ops, later ones with the issued intake key. */
export const deriveIntakeSigningKey = (secret: string): string => createHash("sha256").update(secret, "utf8").digest("hex");
export const newIntakeNonce = (): string => randomBytes(18).toString("base64url");
export const enrolmentIdOf = (code: string): string | undefined => /^(kxe_[A-Za-z0-9_-]{8,16})\.[A-Za-z0-9_-]{32,64}$/.exec(code.trim())?.[1];
export function intakeHeaders(secret: string, ts: number, body: string, enrolmentCode?: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json", "X-Kiorly-Timestamp": String(ts), "X-Kiorly-Signature": signConnectBody(deriveIntakeSigningKey(secret), ts, body) };
  const id = enrolmentCode ? enrolmentIdOf(enrolmentCode) : undefined; if (id) h["X-Kiorex-Enrolment"] = id;
  return h;
}

const BLANK_MISSING = (p: ReturnType<typeof parseProviderProfileJson>, hasGeo: boolean, hasAddr: boolean): string[] => {
  const m: string[] = [];
  if (!p.bioEn?.trim() || p.bioEn.trim().length < 40) m.push("bioEn");
  if (!p.bioAr?.trim() || p.bioAr.trim().length < 40) m.push("bioAr");
  if (!p.photoRelativePath?.trim()) m.push("photo");
  if (!p.specialty) m.push("specialty");
  if (!hasAddr) m.push("address");
  if (!hasGeo) m.push("mapPin");
  return m;
};

@Injectable()
export class KiorexConnectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: MarketplaceListingService,
    private readonly audit: AuditService,
    private readonly fees: KiorexCommissionService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  doc(raw: unknown): ConnectDoc | undefined { return (raw as { kiorexConnect?: ConnectDoc } | null | undefined)?.kiorexConnect; }
  async saveDoc(tenantId: string, next: ConnectDoc) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { providerSettings: true } });
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { providerSettings: { ...((t.providerSettings ?? {}) as Prisma.JsonObject), kiorexConnect: next as unknown as Prisma.JsonObject } } });
  }

  async loadClinic(user: JwtUser, clinicId: string) {
    if (!clinicId) throw new BadRequestException("clinicId is required");
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId: user.tenantId ?? undefined }, select: { id: true, tenantId: true, latitude: true, longitude: true, addressEn: true, addressAr: true, tenant: { select: { id: true, edition: true, name: true, nameAr: true, providerSettings: true, market: { select: { code: true, clinicalConfig: true } } } } } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    this.listings.assertClinicManage(user, clinic.tenantId);
    return clinic;
  }

  /** Everything the wizard shows, computed from real state on every call. */
  async get(user: JwtUser, clinicId: string, opts: { pull?: boolean } = {}) {
    const clinic = await this.loadClinic(user, clinicId);
    const tenantId = clinic.tenantId;
    let doc = this.doc(clinic.tenant.providerSettings);
    // legacy organisations (no document) are already connected: the wizard reports it and offers nothing to request
    const legacy = !doc;
    const connectStatus: ConnectStatus = doc?.status ?? "APPROVED";
    if (opts.pull !== false && doc?.request && ["REQUESTED", "CHANGES_REQUESTED", "APPROVED", "PAUSED"].includes(doc.status)) doc = (await this.pullStatus(tenantId, doc)) ?? doc;
    const listingRows = await this.listings.listClinicListings(user, clinicId, true);
    const clinicianIds = listingRows.map((l) => l.clinicianId);
    const [verifs, users, templates, types, sub, tele, home, rawListings, entitlementOn] = await Promise.all([
      this.prisma.clinicianVerification.findMany({ where: { tenantId, userId: { in: clinicianIds } }, select: { userId: true, status: true, verifiedProfession: true } }),
      this.prisma.user.findMany({ where: { tenantId, id: { in: clinicianIds } }, select: { id: true, profession: true, role: true, additionalRoles: true } }),
      this.prisma.clinicianAvailabilityTemplate.findMany({ where: { tenantId, clinicId, clinicianId: { in: clinicianIds } }, select: { clinicianId: true, weekJson: true } }),
      this.prisma.appointmentType.findMany({ where: { tenantId, isActive: true, marketplaceBookable: true, OR: [{ clinicId }, { clinicId: null }] }, select: { feeAmount: true } }),
      this.prisma.subscription.findUnique({ where: { tenantId }, select: { status: true } }),
      this.prisma.clinicianTelehealthSetting.count({ where: { tenantId, offersTelehealth: true } }),
      this.prisma.clinicianHomeSettings.count({ where: { tenantId, acceptsHomeVisits: true } }),
      this.prisma.marketplaceListing.findMany({ where: { clinicId }, select: { id: true, profileJson: true } }),
      flagOn(this.flags, tenantId, "clinic.kiorex_listing"),
    ]);
    const pack = resolveProfessionPack(clinic.tenant.market);
    const vBy = new Map(verifs.map((v) => [v.userId, v]));
    const uBy = new Map(users.map((u) => [u.id, u]));
    const aBy = new Map(templates.map((t) => [t.clinicianId, t.weekJson]));
    const rawBy = new Map(rawListings.map((r) => [r.id, r.profileJson]));
    const hasGeo = clinic.latitude != null && clinic.longitude != null;
    const hasAddr = Boolean(clinic.addressEn?.trim() && clinic.addressAr?.trim());
    const withFee = types.filter((t) => Number(t.feeAmount ?? 0) > 0).length;
    const doctors: ConnectDoctorFacts[] = listingRows.map((l) => {
      const v = vBy.get(l.clinicianId); const u = uBy.get(l.clinicianId);
      const eff = v && u ? effectiveVerificationStatus(v as never, effectiveProfession(u as never), pack) : null;
      const prof = parseProviderProfileJson(rawBy.get(l.id));
      const pct = providerProfileCompletenessPercent({ profile: prof, hasMarketplaceFees: withFee > 0, clinicHasGeo: hasGeo, clinicHasAddress: hasAddr });
      const week = aBy.get(l.clinicianId);
      return {
        listingId: l.id, clinicianId: l.clinicianId, name: l.clinicianName,
        verification: (eff ?? "NONE") as ConnectDoctorFacts["verification"],
        hasAvailability: !!week && normalizeWeekJson(week, "UTC").days.some((d) => d.slots.length > 0),
        profilePercent: pct, profileMissing: BLANK_MISSING(prof, hasGeo, hasAddr),
        status: l.status as ConnectDoctorFacts["status"], pausedReason: l.pausedReason,
      };
    });
    const edition = clinic.tenant.edition === "NURSE" ? "NURSE" : "CLINIC";
    const steps = computeConnectSteps({
      connectStatus, subscription: (sub?.status ?? "NONE") as never, entitlementOn, bookableTypes: types.length, bookableTypesWithFee: withFee, doctors,
      profileMin: PROVIDER_PROFILE_COMPLETENESS_MIN, consentGiven: !!doc?.consent?.feeAcknowledged, edition, optionConfigured: edition === "NURSE" ? home > 0 : tele > 0,
    });
    const market = clinic.tenant.market?.code ?? "EG";
    let feeCard: unknown = null;
    try { feeCard = await this.fees.listPublic(market); } catch { feeCard = null; }
    return {
      clinicId, tenantId, legacy, enrolmentCodeRequired: !doc?.intakeKeyEnc, status: connectStatus, edition, market, progress: legacy ? 100 : connectProgressPct(steps), canRequest: !legacy && canRequestGoLive(steps) && (connectStatus === "CONSENTED" || connectStatus === "CHANGES_REQUESTED" || connectStatus === "REJECTED"),
      steps, doctors: doctors.map((d) => ({ ...d, ready: d.verification === "VERIFIED" && d.hasAvailability && d.profilePercent >= PROVIDER_PROFILE_COMPLETENESS_MIN })),
      kiorex: doc?.kiorex ?? null, requestId: doc?.request?.id ?? null, consent: doc?.consent ? { at: doc.consent.at, termsVersion: doc.consent.termsVersion, feeAcknowledged: doc.consent.feeAcknowledged } : null,
      termsVersion: KIOREX_TERMS_VERSION, feeCard,
    };
  }

  /** Terms + fee acknowledgement. The fee wording shown in the wizard is read from the market's configured Kiorex rate; this stores which version and what was displayed. */
  async acceptTerms(user: JwtUser, body: { clinicId: string; termsVersion: string; feeAcknowledged: boolean }) {
    const clinic = await this.loadClinic(user, body.clinicId);
    if (body.termsVersion !== KIOREX_TERMS_VERSION) throw new BadRequestException({ code: "TERMS_VERSION_MISMATCH", message: "Reload the page: the terms changed" });
    if (body.feeAcknowledged !== true) throw new BadRequestException({ code: "FEE_ACK_REQUIRED", message: "The fee acknowledgement is required" });
    const doc = this.doc(clinic.tenant.providerSettings);
    if (!doc) throw new ConflictException({ code: "ALREADY_CONNECTED", message: "This organisation is already connected" });
    let feeSnapshot: unknown = null;
    try { feeSnapshot = await this.fees.listPublic(clinic.tenant.market?.code ?? "EG"); } catch { feeSnapshot = null; }
    const next: ConnectDoc = { ...doc, status: doc.status === "STANDALONE" ? "CONSENTED" : doc.status, consent: { at: new Date().toISOString(), userId: user.userId, termsVersion: KIOREX_TERMS_VERSION, feeAcknowledged: true, feeSnapshot } };
    await this.saveDoc(clinic.tenantId, next);
    await this.audit.recordEvent({ tenantId: clinic.tenantId, actorId: user.userId, clinicId: clinic.id, action: "kiorex.connect.terms_accepted", resource: "Tenant", resourceId: clinic.tenantId, metadata: { termsVersion: KIOREX_TERMS_VERSION } });
    return this.get(user, body.clinicId, { pull: false });
  }

  /** Request to go live: DRAFT -> PENDING_VERIFICATION. Idempotent (re-send refreshes the PHI-free readiness snapshot). */
  async requestLive(user: JwtUser, clinicId: string, enrolmentCode?: string) {
    const state = await this.get(user, clinicId, { pull: false });
    if (state.legacy) throw new ConflictException({ code: "ALREADY_CONNECTED", message: "This organisation is already connected" });
    if (state.status === "REQUESTED") return this.resend(user, clinicId, state, enrolmentCode);
    if (!state.canRequest) throw new ConflictException({ code: "CONNECT_NOT_READY", message: "Finish every step before requesting to go live", open: state.steps.filter((s) => !s.optional && !["request", "live"].includes(s.key) && s.status !== "done").map((s) => s.key) });
    const clinic = await this.loadClinic(user, clinicId);
    const doc = this.doc(clinic.tenant.providerSettings)!;
    const sent = await this.send(clinic, state, doc, enrolmentCode, user.email);
    await this.saveDoc(clinic.tenantId, { ...doc, status: "REQUESTED", request: { id: sent.id, token: sent.statusToken ?? doc.request?.token ?? "", submittedAt: new Date().toISOString() }, ...(sent.intakeKey ? { intakeKeyEnc: sealField(sent.intakeKey) } : {}) });
    await this.listings.recomputeTenantListings(clinic.tenantId);
    await this.audit.recordEvent({ tenantId: clinic.tenantId, actorId: user.userId, clinicId, action: "kiorex.connect.requested", resource: "Tenant", resourceId: clinic.tenantId, metadata: { requestId: sent.id } });
    return this.get(user, clinicId, { pull: false });
  }

  private async resend(user: JwtUser, clinicId: string, state: Awaited<ReturnType<KiorexConnectService["get"]>>, enrolmentCode?: string) {
    const clinic = await this.loadClinic(user, clinicId);
    const doc = this.doc(clinic.tenant.providerSettings)!;
    const sent = await this.send(clinic, state, doc, enrolmentCode, user.email);
    if (sent.intakeKey) await this.saveDoc(clinic.tenantId, { ...doc, intakeKeyEnc: sealField(sent.intakeKey) });
    return state;
  }

  private async send(clinic: Awaited<ReturnType<KiorexConnectService["loadClinic"]>>, state: Awaited<ReturnType<KiorexConnectService["get"]>>, doc: ConnectDoc, enrolmentCode?: string, contactEmail?: string): Promise<{ id: string; statusToken?: string; intakeKey?: string }> {
    const base = kiorexApiBase(); const code = enrolmentCode?.trim() || undefined; const intakeKey = doc.intakeKeyEnc ? openField(doc.intakeKeyEnc) ?? undefined : undefined;
    if (!base) throw new ConflictException({ code: "KIOREX_NOT_CONFIGURED", message: "Kiorex connection is not configured for this deployment" });
    if (code && !enrolmentIdOf(code)) throw new BadRequestException({ code: "ENROLMENT_CODE_INVALID", message: "That enrolment code is not valid. Copy it exactly as Kiorex gave it to you" });
    if (!code && !intakeKey) throw new ConflictException({ code: "ENROLMENT_CODE_REQUIRED", message: "Enter the enrolment code Kiorex gave you" });
    const ready = state.doctors.filter((d) => d.ready).length;
    const body = JSON.stringify({
      nonce: newIntakeNonce(), kind: clinic.tenant.edition === "NURSE" ? "NURSE" : "CLINIC", orgRef: clinic.tenantId, name: clinic.tenant.name, nameAr: clinic.tenant.nameAr ?? undefined, market: state.market, ...(contactEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail) ? { contactEmail } : {}),
      locale: "en",
      readiness: { counts: { doctors: state.doctors.length, ready, verified: state.doctors.filter((d) => d.verification === "VERIFIED").length }, documents: { doctorCredentials: state.doctors.some((d) => d.verification === "VERIFIED") }, termsAcceptedAt: doc.consent?.at, termsVersion: doc.consent?.termsVersion, steps: state.steps.map((s) => ({ key: s.key, status: s.status })) },
    });
    const ts = Math.floor(Date.now() / 1000);
    let res: Response;
    try {
      res = await fetch(`${base}/partners/v1/connection-requests`, { method: "POST", headers: intakeHeaders(code ?? intakeKey!, ts, body, code), body, signal: AbortSignal.timeout(8000) });
    } catch {
      throw new ConflictException({ code: "KIOREX_UNREACHABLE", message: "Kiorex could not be reached; nothing was sent. Try again." });
    }
    if (!res.ok) throw new ConflictException({ code: res.status === 401 ? "ENROLMENT_CODE_REJECTED" : res.status === 429 ? "KIOREX_BUSY" : "KIOREX_REJECTED_REQUEST", status: res.status, message: res.status === 401 ? "Kiorex did not accept the enrolment code. Check it, or ask Kiorex for a new one" : "Kiorex did not accept the request" });
    return (await res.json()) as { id: string; statusToken?: string; intakeKey?: string };
  }

  /** Best-effort poll of Kiorex for the decision (the push endpoint is the primary path). */
  private async pullStatus(tenantId: string, doc: ConnectDoc): Promise<ConnectDoc | null> {
    const base = kiorexApiBase(); if (!base || !doc.request?.token) return null;
    try {
      const res = await fetch(`${base}/partners/v1/connection-requests/${encodeURIComponent(doc.request.id)}`, { headers: { "x-connection-token": doc.request.token }, signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const s = (await res.json()) as { status: string; decisionReason?: string | null };
      const next = await this.applyDecision(tenantId, s.status === "LIVE" ? "APPROVED" : s.status, s.decisionReason ?? undefined);
      return next ?? null;
    } catch { return null; }
  }

  /** Kiorex -> Clinic decision (signed marketplace API) or pulled status. Maps Kiorex states to the organisation's connect state and recomputes listings. */
  async applyDecision(tenantId: string, decision: string, reason?: string, connectionId?: string): Promise<ConnectDoc | null> {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { providerSettings: true } });
    if (!t) return null;
    const doc = this.doc(t.providerSettings);
    if (!doc) return null; // legacy organisation: nothing to change
    const map: Record<string, ConnectStatus | undefined> = { APPROVED: "APPROVED", PAUSED: "PAUSED", REJECTED: "REJECTED", CHANGES_REQUESTED: "CHANGES_REQUESTED", PAUSED_BY_KIOREX: "PAUSED" };
    const next: ConnectDoc = { ...doc, kiorex: { status: decision, reason: reason ? "OPS_NOTE" : null, at: new Date().toISOString() } };
    const mapped = map[decision];
    if (mapped) next.status = mapped;
    if (connectionId && doc.request && doc.request.id !== connectionId) return doc;
    if (JSON.stringify(next) !== JSON.stringify(doc)) {
      await this.saveDoc(tenantId, next);
      await this.listings.recomputeTenantListings(tenantId);
    }
    return next;
  }

  /** Counts for the Kiorex signed ping (never names or PHI). */
  async connectionSummary(tenantId: string, orgRef: string) {
    if (tenantId !== orgRef) return null;
    const rows = await this.prisma.marketplaceListing.findMany({ where: { tenantId }, select: { clinicianId: true, status: true, profileJson: true, clinicId: true } });
    const ready = await Promise.all(rows.map(async (r) => {
      const [v, a] = await Promise.all([
        this.prisma.clinicianVerification.findUnique({ where: { userId: r.clinicianId }, select: { status: true } }),
        this.prisma.clinicianAvailabilityTemplate.findUnique({ where: { tenantId_clinicId_clinicianId: { tenantId, clinicId: r.clinicId, clinicianId: r.clinicianId } }, select: { weekJson: true } }),
      ]);
      return v?.status === VerificationStatus.VERIFIED && !!a && normalizeWeekJson(a.weekJson, "UTC").days.some((d) => d.slots.length > 0);
    }));
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { providerSettings: true } });
    return { orgRef, status: this.doc(t?.providerSettings)?.status ?? "APPROVED", listings: { total: rows.length, ready: ready.filter(Boolean).length, live: rows.filter((r) => r.status === ListingStatus.LIVE).length } };
  }
}
