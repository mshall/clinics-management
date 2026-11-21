import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { PrismaService } from "../prisma/prisma.service";
import { MobileEntitlementService } from "./mobile-entitlement.service";
import { MobilePushService } from "./mobile-push.service";
import { MODULES, effectiveRoles } from "./mobile-roles";

/** A repeat request by the same user for the same feature inside this window returns the original (idempotent, no second notification). */
export const UPGRADE_DEDUPE_MS = 24 * 3_600_000;
export const UPGRADE_NOTE_MAX = 500;
export const GENERAL_FEATURE = "general";

/** Valid feature keys: a clinic module key or `general`. */
export const isKnownFeature = (k: string): boolean => k === GENERAL_FEATURE || MODULES.some((m) => m.key === k);

/** Pure: the earliest-created request that still blocks a new one (inside the window), else null. */
export function findDuplicate<T extends { createdAt: Date }>(rows: T[], now: number, windowMs = UPGRADE_DEDUPE_MS): T | null {
  const live = rows.filter((r) => now - r.createdAt.getTime() < windowMs);
  return live.length ? live.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b)) : null;
}

export function cleanNote(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new BadRequestException("note must be text");
  const t = v.trim();
  return t ? t.slice(0, UPGRADE_NOTE_MAX) : null;
}

export const OPEN_REQUESTS_MAX = 10;
export interface OpenUpgradeRequest { id: string; featureKey: string; requesterRole: string; requesterName: string; requestedAt: string; note?: string }
/** Pure: shape open requests for the owner's Home card. Display name only (no contact data); unknown people show as their role. */
export function shapeOpenRequests(rows: Array<{ id: string; featureKey: string; role: string; note: string | null; createdAt: Date; who: string }>, names: Map<string, string>): OpenUpgradeRequest[] {
  return rows.slice(0, OPEN_REQUESTS_MAX).map((r) => ({ id: r.id, featureKey: r.featureKey, requesterRole: r.role, requesterName: names.get(r.who) ?? r.role, requestedAt: r.createdAt.toISOString(), ...(r.note ? { note: r.note } : {}) }));
}

export interface UpgradeRequestResult { id: string; status: "REQUESTED" | "ALREADY_ENTITLED"; featureKey: string; requestedAt: string | null; deduped: boolean; notified: number }

/**
 * POST /mobile/upgrade-request. NOT entitlement-gated (exempt like the alert inbox) because the people who need it are on Basic. Records requester, role,
 * org, feature, note, time; de-duplicates per (user, feature) for 24h; notifies the org owner(s) through the mobile mock push inbox + audit trail.
 */
@Injectable()
export class MobileUpgradeService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly ent: MobileEntitlementService, private readonly push: MobilePushService) {}

  async request(u: JwtUser, body: { featureKey?: unknown; note?: unknown }): Promise<UpgradeRequestResult> {
    const tenantId = requireTenantId(u);
    const featureKey = typeof body?.featureKey === "string" && body.featureKey ? body.featureKey : GENERAL_FEATURE;
    if (!isKnownFeature(featureKey)) throw new BadRequestException("unknown featureKey");
    const note = cleanNote(body?.note);
    const e = await this.ent.evaluate(tenantId);
    if (e.enabled) return { id: "", status: "ALREADY_ENTITLED", featureKey, requestedAt: null, deduped: true, notified: 0 };

    const recent = await this.prisma.mobileUpgradeRequest.findMany({ where: { tenantId, userId: u.userId, featureKey, createdAt: { gt: new Date(Date.now() - UPGRADE_DEDUPE_MS) } }, orderBy: { createdAt: "asc" } });
    const dup = findDuplicate(recent, Date.now());
    if (dup) return { id: dup.id, status: "REQUESTED", featureKey, requestedAt: dup.createdAt.toISOString(), deduped: true, notified: 0 };

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.userId }, select: { role: true, additionalRoles: true } });
    const role = effectiveRoles({ role: user.role, additionalRoles: user.additionalRoles, isTenantOwner: u.isTenantOwner })[0] ?? String(user.role);
    const row = await this.prisma.mobileUpgradeRequest.create({ data: { tenantId, userId: u.userId, role: String(role), featureKey, plan: e.rawPlan, note } });

    const owners = await this.prisma.user.findMany({ where: { tenantId, isTenantOwner: true, deletedAt: null, deactivatedAt: null }, select: { id: true } });
    const notified = await this.push.notifyUsers(tenantId, owners.map((o) => o.id).filter((id) => id !== u.userId), "UPGRADE_REQUEST", { requestId: row.id, featureKey, role: String(role) });
    if (notified) await this.prisma.mobileUpgradeRequest.update({ where: { id: row.id }, data: { notifiedCount: notified } });
    await this.audit.recordEvent({ tenantId, actorId: u.userId, clinicId: null, action: "mobile.upgrade_requested", resource: "MobileUpgradeRequest", resourceId: row.id, metadata: { featureKey, role: String(role), plan: e.rawPlan, notified } });
    return { id: row.id, status: "REQUESTED", featureKey, requestedAt: row.createdAt.toISOString(), deduped: false, notified };
  }

  /** Bootstrap block for non-entitled orgs: what is locked for this role, my latest request, and (owner/admin only) how many are open (other people's) plus the newest 10 of them. */
  async bootstrapBlock(u: JwtUser, lockedModules: string[], isAdmin: boolean) {
    const tenantId = requireTenantId(u);
    const mine = await this.prisma.mobileUpgradeRequest.findFirst({ where: { tenantId, userId: u.userId, createdAt: { gt: new Date(Date.now() - UPGRADE_DEDUPE_MS) } }, orderBy: { createdAt: "desc" } });
    const open = isAdmin ? await this.prisma.mobileUpgradeRequest.count({ where: { tenantId, status: "OPEN", userId: { not: u.userId } } }) : null;
    const openItems = isAdmin ? await this.openItems(tenantId, u.userId) : [];
    return { lockedModules, myRequest: mine ? { featureKey: mine.featureKey, requestedAt: mine.createdAt.toISOString() } : null, openRequests: open, openRequestItems: openItems, canApprove: isAdmin };
  }

  /** Newest open requests with the requester's display name (owner/admin bootstrap only). */
  private async openItems(scopeId: string, self: string): Promise<OpenUpgradeRequest[]> {
    const rows = await this.prisma.mobileUpgradeRequest.findMany({ where: { tenantId: scopeId, status: "OPEN", userId: { not: self } }, orderBy: { createdAt: "desc" }, take: OPEN_REQUESTS_MAX });
    if (!rows.length) return [];
    const ids = [...new Set(rows.map((r) => r.userId))];
    const people = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
    return shapeOpenRequests(rows.map((r) => ({ id: r.id, featureKey: r.featureKey, role: r.role, note: r.note, createdAt: r.createdAt, who: r.userId })), new Map(people.map((p) => [p.id, p.displayName])));
  }
}
