import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, VerificationUpdateField, VerificationUpdateStatus } from "@prisma/client";
import { AuditService } from "../../audit/audit.service";
import type { JwtUser } from "../../auth/jwt-user";
import { decryptClinicianNationalId, encryptClinicianNationalId } from "../../clinician-verification/field-crypto";
import { OUTBOX_EVENT } from "../../messaging/outbox-event-types";
import { OutboxEventService } from "../../messaging/outbox-event.service";
import { PrismaService } from "../../prisma/prisma.service";
import { canGrowth } from "../provider-links/growth-access";
import { bad, MARKETING_ERROR } from "./provider-marketing-common";

export const VERIFICATION_FIELDS = Object.values(VerificationUpdateField) as VerificationUpdateField[];
export const EVIDENCE_MAX = 10;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9_./:-]{0,199}$/;
const VALUE_MAX: Record<VerificationUpdateField, number> = { LICENSE_NUMBER: 60, SPECIALTY: 80, ADDRESS: 300, DISPLAY_NAME: 120, PHOTO: 200, DOCUMENT: 200 };
const OPEN = new Set<VerificationUpdateStatus>([VerificationUpdateStatus.SUBMITTED, VerificationUpdateStatus.NEEDS_INFO]);
const DECISIONS = new Set(["APPROVED", "REJECTED", "NEEDS_INFO"]);

/** Policy `reVerifyOnLicenseChange` (default true; env `GROWTH_REVERIFY_ON_LICENSE_CHANGE=false` turns it off): a pending licence-number change shows "update under review" instead of the verified badge. */
export function reVerifyOnLicenseChange(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GROWTH_REVERIFY_ON_LICENSE_CHANGE?.trim().toLowerCase() !== "false";
}

export type VerificationBadge = "VERIFIED" | "UPDATE_UNDER_REVIEW";
/** Pure: only a pending LICENSE_NUMBER request removes the badge, and only while the policy is on. Other fields keep it during review. */
export function badgeFor(pending: { field: VerificationUpdateField; status: VerificationUpdateStatus }[], policy = reVerifyOnLicenseChange()): VerificationBadge {
  return policy && pending.some((r) => r.field === VerificationUpdateField.LICENSE_NUMBER && OPEN.has(r.status)) ? "UPDATE_UNDER_REVIEW" : "VERIFIED";
}

export function cleanEvidenceRefs(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw bad(MARKETING_ERROR.INVALID, "evidenceFileRefs must be a list of file references");
  if (raw.length > EVIDENCE_MAX) throw bad(MARKETING_ERROR.INVALID, `At most ${EVIDENCE_MAX} evidence files`);
  const out: string[] = [];
  for (const r of raw) {
    const s = String(r ?? "").trim();
    if (!REF_RE.test(s)) throw bad(MARKETING_ERROR.INVALID, "Evidence references must be file ids or storage paths (letters, digits and . _ / : -)");
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

const PHOTO_OR_DOC = new Set<VerificationUpdateField>([VerificationUpdateField.PHOTO, VerificationUpdateField.DOCUMENT]);

type Row = Prisma.ProviderVerificationUpdateRequestGetPayload<object>;
export const toDto = (r: Row) => ({
  id: r.id,
  clinicId: r.clinicId,
  field: r.field,
  oldRef: r.oldRef,
  status: r.status,
  evidenceCount: (r.evidenceFileRefs as string[]).length,
  evidenceFileRefs: r.evidenceFileRefs as string[],
  kiorexRef: r.kiorexRef,
  decisionNote: r.decisionNote,
  decidedAt: r.decidedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/**
 * GRW-P2-C verification update requests: a provider asks Kiorex ops to change a verified public profile field. The new value is encrypted at rest and is
 * never put in an event: the event carries the request reference, the field and the evidence COUNT; Kiorex reads the value through the signed
 * `GET /marketplace/v1/provider-verification/requests/{requestRef}` and answers through the signed `POST .../decisions` (the `ProviderVerificationDecided` body).
 * Prisma-only so the marketplace module can use it without a module cycle.
 */
@Injectable()
export class VerificationRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxEventService,
  ) {}

  private admin(user: JwtUser): string {
    if (!user.tenantId || !canGrowth(user, "widget")) throw new ForbiddenException({ code: "GROWTH_FORBIDDEN", message: "Only an organisation admin can ask to change verified profile data" });
    return user.tenantId;
  }

  private viewer(user: JwtUser): string {
    if (!user.tenantId || !canGrowth(user, "view")) throw new ForbiddenException({ code: "GROWTH_FORBIDDEN", message: "Your role cannot see verification requests" });
    return user.tenantId;
  }

  private async emitRequested(r: Row, tenantId: string) {
    await this.outbox.enqueueEvent({
      tenantId,
      type: OUTBOX_EVENT.PROVIDER_VERIFICATION_UPDATE_REQUESTED,
      aggregateType: "ProviderVerificationUpdate",
      aggregateId: r.id,
      payload: { requestRef: r.id, orgRef: tenantId, clinicId: r.clinicId, field: r.field, evidenceCount: (r.evidenceFileRefs as string[]).length, requestedAt: new Date().toISOString() },
    });
  }

  async create(user: JwtUser, body: { clinicId?: string; field?: string; newValue?: string; oldRef?: string; evidenceFileRefs?: unknown }) {
    const tenantId = this.admin(user);
    const field = String(body.field ?? "").toUpperCase() as VerificationUpdateField;
    if (!VERIFICATION_FIELDS.includes(field)) throw bad(MARKETING_ERROR.INVALID, `field must be one of ${VERIFICATION_FIELDS.join(", ")}`);
    const value = String(body.newValue ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim();
    if (!value || value.length > VALUE_MAX[field]) throw bad(MARKETING_ERROR.INVALID, `newValue is required (at most ${VALUE_MAX[field]} characters)`);
    const evidence = cleanEvidenceRefs(body.evidenceFileRefs);
    if (PHOTO_OR_DOC.has(field) && evidence.length === 0) throw bad(MARKETING_ERROR.INVALID, "A photo or document change needs at least one evidence file");
    const clinic = await this.prisma.clinic.findFirst({ where: { id: body.clinicId ?? "", tenantId }, select: { id: true } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    const open = await this.prisma.providerVerificationUpdateRequest.findFirst({ where: { tenantId, clinicId: clinic.id, field, status: { in: [...OPEN] } } });
    if (open) throw new ConflictException({ code: MARKETING_ERROR.VERIFICATION_STATE, message: "There is already an open request for this field. Withdraw it or wait for the decision.", requestId: open.id });
    const row = await this.prisma.providerVerificationUpdateRequest.create({
      data: { tenantId, clinicId: clinic.id, field, oldRef: body.oldRef ? String(body.oldRef).slice(0, 120) : null, newValueEnc: encryptClinicianNationalId(value), evidenceFileRefs: evidence as unknown as Prisma.InputJsonValue, createdBy: user.userId },
    });
    await this.emitRequested(row, tenantId);
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: clinic.id, action: "growth.verification.requested", resource: "ProviderVerificationUpdateRequest", resourceId: row.id, metadata: { field, evidenceCount: evidence.length } });
    return toDto(row);
  }

  async list(user: JwtUser, q: { clinicId?: string } = {}) {
    const tenantId = this.viewer(user);
    const rows = await this.prisma.providerVerificationUpdateRequest.findMany({ where: { tenantId, ...(q.clinicId ? { clinicId: q.clinicId } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
    return { items: rows.map(toDto), badge: badgeFor(rows), policy: { reVerifyOnLicenseChange: reVerifyOnLicenseChange() } };
  }

  async withdraw(user: JwtUser, id: string) {
    const tenantId = this.admin(user);
    const row = await this.prisma.providerVerificationUpdateRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("Request not found");
    if (!OPEN.has(row.status)) throw new ConflictException({ code: MARKETING_ERROR.VERIFICATION_STATE, message: "Only an open request can be withdrawn" });
    const next = await this.prisma.providerVerificationUpdateRequest.update({ where: { id }, data: { status: VerificationUpdateStatus.WITHDRAWN } });
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: row.clinicId, action: "growth.verification.withdrawn", resource: "ProviderVerificationUpdateRequest", resourceId: id, metadata: { field: row.field } });
    return toDto(next);
  }

  /** The provider answers a NEEDS_INFO decision with more evidence; the request returns to SUBMITTED and the event is sent again (same requestRef: idempotent for Kiorex). */
  async addEvidence(user: JwtUser, id: string, body: { evidenceFileRefs?: unknown }) {
    const tenantId = this.admin(user);
    const row = await this.prisma.providerVerificationUpdateRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("Request not found");
    if (row.status !== VerificationUpdateStatus.NEEDS_INFO) throw new ConflictException({ code: MARKETING_ERROR.VERIFICATION_STATE, message: "Evidence can be added only when Kiorex asked for more information" });
    const add = cleanEvidenceRefs(body.evidenceFileRefs);
    if (!add.length) throw bad(MARKETING_ERROR.INVALID, "Add at least one evidence file");
    const merged = [...new Set([...(row.evidenceFileRefs as string[]), ...add])];
    if (merged.length > EVIDENCE_MAX) throw bad(MARKETING_ERROR.INVALID, `At most ${EVIDENCE_MAX} evidence files`);
    const next = await this.prisma.providerVerificationUpdateRequest.update({ where: { id }, data: { evidenceFileRefs: merged as unknown as Prisma.InputJsonValue, status: VerificationUpdateStatus.SUBMITTED } });
    await this.emitRequested(next, tenantId);
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: row.clinicId, action: "growth.verification.evidence_added", resource: "ProviderVerificationUpdateRequest", resourceId: id, metadata: { added: add.length } });
    return toDto(next);
  }

  // ------------------------------------------------------------------ Kiorex side (signed marketplace calls; the caller is authenticated by the guard)

  /** What Kiorex ops needs to decide: the field, the requested value and the evidence references. Never any patient data. */
  async readForKiorex(requestRef: string) {
    const r = await this.prisma.providerVerificationUpdateRequest.findUnique({ where: { id: requestRef } });
    if (!r) throw new NotFoundException({ code: "VERIFICATION_REQUEST_NOT_FOUND", message: "No such request" });
    return { requestRef: r.id, orgRef: r.tenantId, clinicId: r.clinicId, field: r.field, oldRef: r.oldRef, newValue: decryptClinicianNationalId(r.newValueEnc), evidenceFileRefs: r.evidenceFileRefs as string[], status: r.status, requestedAt: r.createdAt.toISOString() };
  }

  /** `ProviderVerificationDecided` delivered as a signed call. Idempotent on (requestRef, decision); a decision for a closed request is acknowledged without change. */
  async applyDecision(body: { requestRef?: string; kiorexRef?: string; orgRef?: string; clinicId?: string; decision?: string; note?: string; decidedAt?: string }) {
    const decision = String(body.decision ?? "");
    if (!DECISIONS.has(decision)) throw bad("VERIFICATION_DECISION_INVALID", "decision must be APPROVED, REJECTED or NEEDS_INFO");
    const row = await this.prisma.providerVerificationUpdateRequest.findUnique({ where: { id: body.requestRef ?? "" } });
    if (!row || (body.orgRef && body.orgRef !== row.tenantId) || (body.clinicId && body.clinicId !== row.clinicId)) throw new NotFoundException({ code: "VERIFICATION_REQUEST_NOT_FOUND", message: "No such request" });
    if (!OPEN.has(row.status)) return { ok: true, duplicate: true, status: row.status };
    const decidedAt = body.decidedAt && !Number.isNaN(Date.parse(body.decidedAt)) ? new Date(body.decidedAt) : new Date();
    const status = decision === "APPROVED" ? VerificationUpdateStatus.APPROVED : decision === "REJECTED" ? VerificationUpdateStatus.REJECTED : VerificationUpdateStatus.NEEDS_INFO;
    const note = String(body.note ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, 300) || null;
    const next = await this.prisma.providerVerificationUpdateRequest.update({ where: { id: row.id }, data: { status, kiorexRef: body.kiorexRef ? String(body.kiorexRef).slice(0, 120) : row.kiorexRef, decidedAt, decisionNote: note } });
    await this.audit.recordEvent({ tenantId: row.tenantId, actorId: null, clinicId: row.clinicId, action: "growth.verification.decided", resource: "ProviderVerificationUpdateRequest", resourceId: row.id, metadata: { decision, field: row.field } });
    return { ok: true, duplicate: false, status: next.status };
  }
}
