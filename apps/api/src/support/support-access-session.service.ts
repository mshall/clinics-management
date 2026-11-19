import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SupportAccessStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { hasRole, isTenantOwnerPrincipal } from "../common/effective-roles";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_DURATION_MIN = 60;
const MAX_DURATION_MIN = 8 * 60;

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}

function maskNationalId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 4) return "****";
  return `${"*".repeat(Math.max(id.length - 4, 0))}${id.slice(-4)}`;
}

@Injectable()
export class SupportAccessSessionService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPlatform(user: JwtUser) {
    if (!isPlatformSuperAdmin(user)) {
      throw new ForbiddenException("Only platform support can request tenant access");
    }
  }

  private assertOwnerApprover(user: JwtUser, tenantId: string) {
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException("Only the organization owner/admin can decide support access");
    }
    const ok = isTenantOwnerPrincipal(user) || hasRole(user, UserRole.GROUP_ADMIN);
    if (!ok) {
      throw new ForbiddenException("Only the organization owner/admin can decide support access");
    }
  }

  private mapSession(row: {
    id: string;
    tenantId: string;
    requesterUserId: string;
    reason: string;
    status: SupportAccessStatus;
    durationMinutes: number;
    requestedUnmaskPhi: boolean;
    phiUnmasked: boolean;
    approverUserId: string | null;
    decidedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      requesterUserId: row.requesterUserId,
      reason: row.reason,
      status: row.status,
      durationMinutes: row.durationMinutes,
      requestedUnmaskPhi: row.requestedUnmaskPhi,
      phiUnmasked: row.phiUnmasked,
      approverUserId: row.approverUserId,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async expireIfNeeded(id: string) {
    const row = await this.prisma.supportAccessSession.findUnique({ where: { id } });
    if (!row) return null;
    if (
      row.status === SupportAccessStatus.APPROVED &&
      row.expiresAt &&
      row.expiresAt.getTime() <= Date.now()
    ) {
      return this.prisma.supportAccessSession.update({
        where: { id },
        data: { status: SupportAccessStatus.EXPIRED },
      });
    }
    return row;
  }

  async requestAccess(
    user: JwtUser,
    body: {
      tenantId: string;
      reason: string;
      durationMinutes?: number;
      requestedUnmaskPhi?: boolean;
    },
  ) {
    this.assertPlatform(user);
    const tenantId = body.tenantId.trim();
    const reason = body.reason.trim();
    if (!tenantId) throw new BadRequestException("tenantId is required");
    if (!reason) throw new BadRequestException("reason is required");
    const durationMinutes = Math.min(
      Math.max(Number(body.durationMinutes ?? DEFAULT_DURATION_MIN) || DEFAULT_DURATION_MIN, 15),
      MAX_DURATION_MIN,
    );
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundException("Organization not found");

    const row = await this.prisma.supportAccessSession.create({
      data: {
        tenantId,
        requesterUserId: user.userId,
        reason,
        durationMinutes,
        requestedUnmaskPhi: Boolean(body.requestedUnmaskPhi),
        status: SupportAccessStatus.PENDING,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: "support.access_requested",
        resource: "SupportAccessSession",
        resourceId: row.id,
        metadata: { reason, durationMinutes, requestedUnmaskPhi: Boolean(body.requestedUnmaskPhi) },
      },
    });
    return this.mapSession(row);
  }

  async listForTenant(user: JwtUser, tenantId: string) {
    this.assertOwnerApprover(user, tenantId);
    const rows = await this.prisma.supportAccessSession.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const mapped = [];
    for (const row of rows) {
      const fresh = (await this.expireIfNeeded(row.id)) ?? row;
      mapped.push(this.mapSession(fresh));
    }
    return mapped;
  }

  async listMine(user: JwtUser) {
    this.assertPlatform(user);
    const rows = await this.prisma.supportAccessSession.findMany({
      where: { requesterUserId: user.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const mapped = [];
    for (const row of rows) {
      const fresh = (await this.expireIfNeeded(row.id)) ?? row;
      mapped.push(this.mapSession(fresh));
    }
    return mapped;
  }

  async decide(
    user: JwtUser,
    sessionId: string,
    body: { approved: boolean; allowUnmaskPhi?: boolean },
  ) {
    const row = await this.prisma.supportAccessSession.findUnique({ where: { id: sessionId } });
    if (!row) throw new NotFoundException("Support access request not found");
    this.assertOwnerApprover(user, row.tenantId);
    if (row.status !== SupportAccessStatus.PENDING) {
      throw new BadRequestException("Request is no longer pending");
    }
    const now = new Date();
    if (!body.approved) {
      const denied = await this.prisma.supportAccessSession.update({
        where: { id: sessionId },
        data: {
          status: SupportAccessStatus.DENIED,
          approverUserId: user.userId,
          decidedAt: now,
          phiUnmasked: false,
        },
      });
      await this.prisma.auditLog.create({
        data: {
          tenantId: row.tenantId,
          actorId: user.userId,
          action: "support.access_denied",
          resource: "SupportAccessSession",
          resourceId: sessionId,
        },
      });
      return this.mapSession(denied);
    }

    const expiresAt = new Date(now.getTime() + row.durationMinutes * 60_000);
    const phiUnmasked = Boolean(body.allowUnmaskPhi) && row.requestedUnmaskPhi;
    const approved = await this.prisma.supportAccessSession.update({
      where: { id: sessionId },
      data: {
        status: SupportAccessStatus.APPROVED,
        approverUserId: user.userId,
        decidedAt: now,
        expiresAt,
        phiUnmasked,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: row.tenantId,
        actorId: user.userId,
        action: "support.access_approved",
        resource: "SupportAccessSession",
        resourceId: sessionId,
        metadata: { expiresAt: expiresAt.toISOString(), phiUnmasked },
      },
    });
    return this.mapSession(approved);
  }

  async revoke(user: JwtUser, sessionId: string) {
    const row = await this.prisma.supportAccessSession.findUnique({ where: { id: sessionId } });
    if (!row) throw new NotFoundException("Support access request not found");
    const isOwner = user.tenantId === row.tenantId;
    const isRequester = isPlatformSuperAdmin(user) && user.userId === row.requesterUserId;
    if (isOwner) this.assertOwnerApprover(user, row.tenantId);
    else if (!isRequester) throw new ForbiddenException("Cannot revoke this session");
    if (row.status !== SupportAccessStatus.APPROVED && row.status !== SupportAccessStatus.PENDING) {
      throw new BadRequestException("Session cannot be revoked");
    }
    const updated = await this.prisma.supportAccessSession.update({
      where: { id: sessionId },
      data: { status: SupportAccessStatus.REVOKED, decidedAt: new Date(), approverUserId: user.userId },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: row.tenantId,
        actorId: user.userId,
        action: "support.access_revoked",
        resource: "SupportAccessSession",
        resourceId: sessionId,
      },
    });
    return this.mapSession(updated);
  }

  /** AC: support cannot open a patient chart without an active approved session. */
  async openPatientChart(user: JwtUser, tenantId: string, patientId: string) {
    this.assertPlatform(user);
    const tid = tenantId.trim();
    const pid = patientId.trim();
    if (!tid || !pid) throw new BadRequestException("tenantId and patientId are required");

    const sessions = await this.prisma.supportAccessSession.findMany({
      where: {
        tenantId: tid,
        requesterUserId: user.userId,
        status: SupportAccessStatus.APPROVED,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    let active = null as (typeof sessions)[number] | null;
    for (const s of sessions) {
      const fresh = await this.expireIfNeeded(s.id);
      if (fresh?.status === SupportAccessStatus.APPROVED) {
        active = fresh;
        break;
      }
    }
    if (!active) {
      throw new ForbiddenException({
        code: "SUPPORT_ACCESS_REQUIRED",
        message: "Support cannot open a patient chart without an active approved session",
      });
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: pid, tenantId: tid, deletedAt: null },
      select: {
        id: true,
        mrn: true,
        firstNameEn: true,
        lastNameEn: true,
        firstNameAr: true,
        lastNameAr: true,
        phone: true,
        nationalId: true,
        dob: true,
        gender: true,
        email: true,
      },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const masked = !active.phiUnmasked;
    const chart = {
      id: patient.id,
      mrn: patient.mrn,
      firstNameEn: patient.firstNameEn,
      lastNameEn: patient.lastNameEn,
      firstNameAr: patient.firstNameAr,
      lastNameAr: patient.lastNameAr,
      gender: patient.gender,
      dateOfBirth: masked ? null : (patient.dob?.toISOString().slice(0, 10) ?? null),
      phone: masked ? maskPhone(patient.phone) : patient.phone,
      nationalId: masked ? maskNationalId(patient.nationalId) : patient.nationalId,
      email: masked ? null : patient.email,
      phiMasked: masked,
      supportSessionId: active.id,
    };

    await this.prisma.supportAccessReadLog.create({
      data: {
        sessionId: active.id,
        patientId: patient.id,
        resource: "Patient",
        resourceId: patient.id,
        action: "patient.chart.read",
        masked,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: tid,
        actorId: user.userId,
        action: "support.patient_chart_read",
        resource: "Patient",
        resourceId: patient.id,
        metadata: { sessionId: active.id, masked },
      },
    });
    return chart;
  }
}
