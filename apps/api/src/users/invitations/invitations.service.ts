import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PlanKey, Prisma, UserRole, type Invitation } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import type { CountryCode } from "libphonenumber-js";
import { AuditService } from "../../audit/audit.service";
import type { JwtUser } from "../../auth/jwt-user";
import { ensureUserEmployeeRecord } from "../../common/clinic-staff-employee";
import { hasAnyRole, hasRole, isTenantOwnerPrincipal, sanitizeAdditionalRoles } from "../../common/effective-roles";
import { assertCanCreateGroupAdminRole } from "../../common/group-admin-role-policy";
import { normalizePhoneToE164 } from "../../common/phone-e164";
import { EntitlementsService } from "../../entitlements/entitlements.service";
import { ENTITLEMENT_MIN_PLAN } from "../../entitlements/plans-matrix";
import { PlanUpgradeRequiredException } from "../../entitlements/plan-upgrade-required.exception";
import { OutboxEventService, OUTBOX_TARGET_INTERNAL } from "../../messaging/outbox-event.service";
import { PrismaService } from "../../prisma/prisma.service";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_ROLES = [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER] as const;
const CLINIC_SCOPE_ROLES = [UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateInvitationInput = {
  phoneOrEmail: string;
  roles: UserRole[];
  displayName?: string;
  clinicIds?: string[];
};

export type AcceptInvitationInput = { password: string; email?: string; displayName?: string };

export function hashInvitationToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function assertCanInvite(user: JwtUser): void {
  if (isTenantOwnerPrincipal(user) || hasAnyRole(user, INVITE_ROLES)) return;
  throw new ForbiddenException("Only the clinic owner or an admin can invite staff");
}

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export function invitationStatus(inv: Pick<Invitation, "acceptedAt" | "revokedAt" | "expiresAt">, now = new Date()): InvitationStatus {
  if (inv.acceptedAt) return "ACCEPTED";
  if (inv.revokedAt) return "REVOKED";
  if (inv.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "PENDING";
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly outbox: OutboxEventService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private webBaseUrl(): string {
    return (
      this.config.get<string>("APP_WEB_URL")?.trim() ||
      this.config.get<string>("WEB_APP_URL")?.trim() ||
      "http://localhost:5173"
    ).replace(/\/$/, "");
  }

  acceptUrl(rawToken: string): string {
    return `${this.webBaseUrl()}/invite/${encodeURIComponent(rawToken)}`;
  }

  private dto(inv: Invitation, acceptUrl?: string) {
    return {
      id: inv.id,
      phoneOrEmail: inv.phoneOrEmail,
      channel: inv.channel,
      displayName: inv.displayName,
      roles: inv.roles,
      clinicIds: inv.clinicIds,
      status: invitationStatus(inv),
      expiresAt: inv.expiresAt.toISOString(),
      acceptedAt: inv.acceptedAt?.toISOString() ?? null,
      sendCount: inv.sendCount,
      lastSentAt: inv.lastSentAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      ...(acceptUrl ? { acceptUrl } : {}),
    };
  }

  /** Seats used by active users + pending invitations for the same seat pool (clinician vs assistant). */
  async assertSeatAvailable(tenantId: string, roles: UserRole[], excludeInvitationId?: string): Promise<void> {
    const physician = roles.includes(UserRole.PHYSICIAN);
    const now = new Date();
    const pending = await this.prisma.invitation.findMany({
      where: {
        tenantId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
        ...(excludeInvitationId ? { NOT: { id: excludeInvitationId } } : {}),
      },
      select: { roles: true },
    });
    const pendingInPool = pending.filter((p) => p.roles.includes(UserRole.PHYSICIAN) === physician).length;
    const users = await this.prisma.user.findMany({
      where: { tenantId, deletedAt: null, deactivatedAt: null },
      select: { role: true, additionalRoles: true, isTenantOwner: true },
    });
    const limitKey = physician ? "max_clinicians" : "max_assistant_seats";
    const used = physician
      ? users.filter((u) => hasRole(u, UserRole.PHYSICIAN)).length
      : users.filter((u) => !u.isTenantOwner && !hasRole(u, UserRole.PHYSICIAN)).length;
    const limit = await this.entitlements.getLimit(tenantId, limitKey);
    if (limit === null) return;
    if (used + pendingInPool + 1 <= limit) return;
    const requiredPlan = ENTITLEMENT_MIN_PLAN[limitKey] ?? PlanKey.PRO;
    throw new PlanUpgradeRequiredException(limitKey, requiredPlan);
  }

  private normalizeContact(raw: string, country: string): { contact: string; channel: "EMAIL" | "WHATSAPP" } {
    const value = raw.trim();
    if (value.includes("@")) {
      const email = value.toLowerCase();
      if (!EMAIL.test(email)) throw new BadRequestException({ message: "Invalid email", code: "INVITE_CONTACT_INVALID" });
      return { contact: email, channel: "EMAIL" };
    }
    const phone = normalizePhoneToE164(value, country as CountryCode);
    if (!phone) throw new BadRequestException({ message: "Invalid phone number", code: "INVITE_CONTACT_INVALID" });
    return { contact: phone, channel: "WHATSAPP" };
  }

  private async enqueueSend(
    tx: Prisma.TransactionClient,
    inv: Invitation,
    acceptUrl: string,
    tenant: { name: string; nameAr: string },
    inviterName: string,
  ): Promise<void> {
    await this.outbox.enqueueEvent(
      {
        tenantId: inv.tenantId,
        type: "staff.invitation",
        aggregateType: "Invitation",
        aggregateId: inv.id,
        target: OUTBOX_TARGET_INTERNAL,
        payload: {
          channel: inv.channel === "EMAIL" ? "email" : "WHATSAPP",
          ...(inv.channel === "EMAIL" ? { to: inv.phoneOrEmail } : { toPhone: inv.phoneOrEmail }),
          acceptUrl,
          roles: inv.roles,
          expiresAt: inv.expiresAt.toISOString(),
          clinicName: tenant.name,
          inviterName,
          textEn: `${inviterName} invited you to join ${tenant.name} on Kiorly. Accept within 7 days: ${acceptUrl}`,
          textAr: `دعاك ${inviterName} للانضمام إلى ${tenant.nameAr || tenant.name} على كيورلي. اقبل الدعوة خلال 7 أيام: ${acceptUrl}`,
        },
      },
      tx,
    );
  }

  async list(tenantId: string) {
    const rows = await this.prisma.invitation.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((r) => this.dto(r));
  }

  async create(user: JwtUser, tenantId: string, input: CreateInvitationInput) {
    assertCanInvite(user);
    const roles = [...new Set(input.roles ?? [])];
    if (!roles.length) throw new BadRequestException("At least one role is required");
    if (roles.includes(UserRole.PLATFORM_SUPER_ADMIN)) throw new BadRequestException("Invalid role");
    for (const r of roles) {
      if (!Object.values(UserRole).includes(r)) throw new BadRequestException(`Invalid role: ${r}`);
      assertCanCreateGroupAdminRole(r, user);
    }
    const clinicIds = [...new Set(input.clinicIds ?? [])];
    if (roles.some((r) => (CLINIC_SCOPE_ROLES as readonly UserRole[]).includes(r)) && !clinicIds.length) {
      throw new BadRequestException("clinicIds is required for clinic administrators and branch managers");
    }
    if (clinicIds.length) {
      const found = await this.prisma.clinic.count({ where: { tenantId, id: { in: clinicIds } } });
      if (found !== clinicIds.length) throw new BadRequestException("Invalid clinicId");
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, nameAr: true, market: { select: { code: true } } },
    });
    const { contact, channel } = this.normalizeContact(input.phoneOrEmail ?? "", tenant.market?.code ?? "EG");
    if (channel === "EMAIL") {
      const existing = await this.prisma.user.findFirst({ where: { tenantId, email: contact }, select: { id: true } });
      if (existing) throw new ConflictException({ message: "A user with this email already exists", code: "INVITE_USER_EXISTS" });
    }
    const duplicate = await this.prisma.invitation.findFirst({
      where: { tenantId, phoneOrEmail: contact, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException({ message: "An invitation is already pending", code: "INVITE_PENDING", invitationId: duplicate.id });

    await this.assertSeatAvailable(tenantId, roles);

    const inviter = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { displayName: true } });
    const rawToken = randomBytes(32).toString("base64url");
    const url = this.acceptUrl(rawToken);
    const inv = await this.prisma.$transaction(async (tx) => {
      const row = await tx.invitation.create({
        data: {
          tenantId,
          phoneOrEmail: contact,
          channel,
          displayName: input.displayName?.trim() ?? "",
          roles,
          clinicIds,
          tokenHash: hashInvitationToken(rawToken),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          createdBy: user.userId,
        },
      });
      await this.enqueueSend(tx, row, url, tenant, inviter?.displayName ?? "Kiorly");
      return row;
    });
    await this.audit.recordEvent({
      tenantId,
      actorId: user.userId,
      clinicId: null,
      action: "STAFF_INVITATION_SENT",
      resource: "Invitation",
      resourceId: inv.id,
      metadata: { channel, roles },
    });
    return this.dto(inv, url);
  }

  private async findOwned(tenantId: string, id: string): Promise<Invitation> {
    const inv = await this.prisma.invitation.findFirst({ where: { id, tenantId } });
    if (!inv) throw new NotFoundException("Invitation not found");
    return inv;
  }

  /** New token (old link stops working) + fresh 7-day expiry. */
  async resend(user: JwtUser, tenantId: string, id: string) {
    assertCanInvite(user);
    const inv = await this.findOwned(tenantId, id);
    const status = invitationStatus(inv);
    if (status === "ACCEPTED" || status === "REVOKED") {
      throw new ConflictException({ message: `Invitation is ${status.toLowerCase()}`, code: "INVITE_NOT_PENDING" });
    }
    await this.assertSeatAvailable(tenantId, inv.roles, inv.id);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, nameAr: true } });
    const inviter = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { displayName: true } });
    const rawToken = randomBytes(32).toString("base64url");
    const url = this.acceptUrl(rawToken);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.invitation.update({
        where: { id },
        data: {
          tokenHash: hashInvitationToken(rawToken),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          sendCount: { increment: 1 },
          lastSentAt: new Date(),
        },
      });
      await this.enqueueSend(tx, row, url, tenant, inviter?.displayName ?? "Kiorly");
      return row;
    });
    await this.audit.recordEvent({
      tenantId,
      actorId: user.userId,
      clinicId: null,
      action: "STAFF_INVITATION_RESENT",
      resource: "Invitation",
      resourceId: id,
      metadata: { sendCount: updated.sendCount },
    });
    return this.dto(updated, url);
  }

  async revoke(user: JwtUser, tenantId: string, id: string) {
    assertCanInvite(user);
    const inv = await this.findOwned(tenantId, id);
    if (inv.acceptedAt) throw new ConflictException({ message: "Invitation already accepted", code: "INVITE_NOT_PENDING" });
    const updated = inv.revokedAt ? inv : await this.prisma.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.recordEvent({
      tenantId,
      actorId: user.userId,
      clinicId: null,
      action: "STAFF_INVITATION_REVOKED",
      resource: "Invitation",
      resourceId: id,
    });
    return this.dto(updated);
  }

  private async findByToken(rawToken: string): Promise<Invitation> {
    const inv = await this.prisma.invitation.findUnique({ where: { tokenHash: hashInvitationToken(rawToken.trim()) } });
    if (!inv) throw new NotFoundException({ message: "Invitation not found", code: "INVITE_NOT_FOUND" });
    const status = invitationStatus(inv);
    if (status !== "PENDING") throw new GoneException({ message: `Invitation is ${status.toLowerCase()}`, code: `INVITE_${status}` });
    return inv;
  }

  async publicView(rawToken: string) {
    const inv = await this.findByToken(rawToken);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: inv.tenantId }, select: { name: true, nameAr: true } });
    return {
      clinicName: tenant.name,
      clinicNameAr: tenant.nameAr || tenant.name,
      roles: inv.roles,
      displayName: inv.displayName,
      channel: inv.channel,
      email: inv.channel === "EMAIL" ? inv.phoneOrEmail : null,
      expiresAt: inv.expiresAt.toISOString(),
    };
  }

  async accept(rawToken: string, body: AcceptInvitationInput) {
    const inv = await this.findByToken(rawToken);
    if (!body.password || body.password.length < 8) throw new BadRequestException("Password must be at least 8 characters");
    const email = (inv.channel === "EMAIL" ? inv.phoneOrEmail : body.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) throw new BadRequestException({ message: "A valid email is required", code: "INVITE_EMAIL_REQUIRED" });
    const displayName = (body.displayName?.trim() || inv.displayName || email.split("@")[0]).slice(0, 120);
    const existing = await this.prisma.user.findFirst({ where: { tenantId: inv.tenantId, email }, select: { id: true } });
    if (existing) throw new ConflictException({ message: "A user with this email already exists", code: "INVITE_USER_EXISTS" });
    await this.assertSeatAvailable(inv.tenantId, inv.roles, inv.id);

    const [primary, ...rest] = inv.roles;
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (!claimed.count) throw new GoneException({ message: "Invitation is no longer pending", code: "INVITE_ACCEPTED" });
      const u = await tx.user.create({
        data: {
          tenantId: inv.tenantId,
          email,
          displayName,
          passwordHash,
          role: primary,
          additionalRoles: sanitizeAdditionalRoles(primary, rest),
        },
      });
      if (inv.clinicIds.length && inv.roles.some((r) => (CLINIC_SCOPE_ROLES as readonly UserRole[]).includes(r))) {
        await tx.clinicAdminScope.createMany({
          data: inv.clinicIds.map((clinicId) => ({ tenantId: inv.tenantId, userId: u.id, clinicId })),
          skipDuplicates: true,
        });
      }
      await ensureUserEmployeeRecord(tx, inv.tenantId, u, inv.clinicIds[0] ?? null);
      await tx.invitation.update({ where: { id: inv.id }, data: { acceptedUserId: u.id } });
      return u;
    });
    await this.audit.recordEvent({
      tenantId: inv.tenantId,
      actorId: user.id,
      clinicId: null,
      action: "STAFF_INVITATION_ACCEPTED",
      resource: "Invitation",
      resourceId: inv.id,
      metadata: { roles: inv.roles },
    });
    return { ok: true as const, email };
  }
}
