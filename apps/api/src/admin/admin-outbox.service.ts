import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { hasAnyRoleInSet } from "../common/effective-roles";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxDispatcherService } from "../messaging/outbox-dispatcher.service";
import { outboxPendingLagExceedsAlert, outboxPendingLagMs } from "../messaging/outbox-lag";

const GOVERNANCE_ROLES = new Set<UserRole>([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
]);

@Injectable()
export class AdminOutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: OutboxDispatcherService,
  ) {}

  private assertAccess(user: JwtUser, tenantId: string): void {
    if (!user.tenantId || user.tenantId !== tenantId || !hasAnyRoleInSet(user, GOVERNANCE_ROLES)) {
      throw new ForbiddenException("Administrator access required");
    }
  }

  async list(
    tenantId: string,
    user: JwtUser,
    page?: string,
    pageSize?: string,
    status?: string,
    type?: string,
  ) {
    this.assertAccess(user, tenantId);
    const { page: p, pageSize: ps, skip } = parsePageParams(page, pageSize);
    const where = {
      tenantId,
      ...(status?.trim() ? { status: status.trim() } : {}),
      ...(type?.trim() ? { type: { contains: type.trim(), mode: "insensitive" as const } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.outboxEvent.count({ where }),
      this.prisma.outboxEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: ps,
      }),
    ]);
    return {
      ...paginate(
        rows.map((r) => ({
        id: r.id,
        type: r.type,
        aggregateType: r.aggregateType,
        aggregateId: r.aggregateId,
        target: r.target,
        status: r.status,
        attempts: r.attempts,
        nextAttemptAt: r.nextAttemptAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        sentAt: r.sentAt?.toISOString() ?? null,
        })),
        total,
        p,
        ps,
      ),
    };
  }

  async summary(tenantId: string, user: JwtUser) {
    this.assertAccess(user, tenantId);
    const [pending, failed, dead, oldest] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { tenantId, status: "PENDING" } }),
      this.prisma.outboxEvent.count({ where: { tenantId, status: "FAILED" } }),
      this.prisma.outboxEvent.count({ where: { tenantId, status: "DEAD" } }),
      this.dispatcher.oldestPendingCreatedAt(),
    ]);
    const lagMs = outboxPendingLagMs(oldest);
    return {
      pending,
      failed,
      dead,
      oldestPendingCreatedAt: oldest?.toISOString() ?? null,
      lagAlert: outboxPendingLagExceedsAlert(oldest),
      lagMs,
    };
  }

  async retry(tenantId: string, user: JwtUser, eventId: string) {
    this.assertAccess(user, tenantId);
    const row = await this.prisma.outboxEvent.findFirst({ where: { id: eventId, tenantId } });
    if (!row) throw new NotFoundException("Outbox event not found");
    return this.dispatcher.retryEvent(eventId);
  }
}