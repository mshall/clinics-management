import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnprocessableEntityException, BadRequestException } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { JwtUser } from "../../auth/jwt-user";
import { OUTBOX_EVENT } from "../../messaging/outbox-event-types";
import { OutboxEventService } from "../../messaging/outbox-event.service";
import { PrismaService } from "../../prisma/prisma.service";
import { canGrowth } from "../provider-links/growth-access";
import { DAILY_LIMIT, DUPLICATE_WINDOW_DAYS, cleanReferral } from "./b2b-logic";

type Row = Awaited<ReturnType<PrismaService["providerB2BReferral"]["findFirstOrThrow"]>>;
export const toDto = (r: Row) => ({ id: r.id, clinicId: r.clinicId, companyName: r.companyName, sizeBucket: r.sizeBucket, contactRef: r.contactRef, status: r.status, createdAt: r.createdAt.toISOString() });

/**
 * "Refer a company" (GRW-P4-C): a provider tells Kiorex about a company that could offer its staff a Kiorex benefit. Company data only: the name, a size bucket and the provider's OWN opaque reference to
 * the contact. It travels once through the outbox as `CorporateLeadReferred` and Kiorex ops see it as a lead. It creates NO reward, credit, fee share or wallet entry for the provider (any fee share is counsel
 * and CEO gated, NEEDS_HUMAN), changes no patient attribution and shares no patient data. A status page shows what was sent; Kiorex's own pipeline stages are internal and are not mirrored back in this phase.
 * Roles: the Growth matrix (organisation admin and marketing send; every Growth viewer reads).
 */
@Injectable()
export class B2bReferralService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxEventService) {}

  private who(user: JwtUser, action: "view" | "create"): string {
    if (!user.tenantId || !canGrowth(user, action)) throw new ForbiddenException({ code: "GROWTH_FORBIDDEN", message: action === "create" ? "Your role cannot refer a company" : "Your role cannot see company referrals" });
    return user.tenantId;
  }

  async create(user: JwtUser, body: { clinicId?: string; companyName?: unknown; sizeBucket?: unknown; contactRef?: unknown }, now = new Date()) {
    const tenantId = this.who(user, "create");
    const c = cleanReferral(body ?? {});
    if (!c.ok) {
      if (c.code === "PERSONAL_DATA") throw new UnprocessableEntityException({ code: "B2B_PERSONAL_DATA", message: c.message });
      throw new BadRequestException({ code: "B2B_INVALID", message: c.message });
    }
    const clinic = await this.prisma.clinic.findFirst({ where: { id: body.clinicId ?? "", tenantId }, select: { id: true } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    const dayAgo = new Date(now.getTime() - 86_400_000);
    if ((await this.prisma.providerB2BReferral.count({ where: { tenantId, createdAt: { gt: dayAgo } } })) >= DAILY_LIMIT) throw new HttpException({ code: "B2B_RATE_LIMITED", message: `At most ${DAILY_LIMIT} company referrals a day` }, HttpStatus.TOO_MANY_REQUESTS);
    const since = new Date(now.getTime() - DUPLICATE_WINDOW_DAYS * 86_400_000);
    const dup = await this.prisma.providerB2BReferral.findFirst({ where: { tenantId, companyKey: c.value.companyKey, createdAt: { gt: since } } });
    if (dup) throw new ConflictException({ code: "B2B_DUPLICATE", message: "You already referred this company recently", referralId: dup.id });
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.providerB2BReferral.create({ data: { tenantId, clinicId: clinic.id, companyName: c.value.companyName, companyKey: c.value.companyKey, sizeBucket: c.value.sizeBucket, contactRef: c.value.contactRef, createdBy: user.userId } });
      await this.outbox.enqueueEvent({
        tenantId, type: OUTBOX_EVENT.CORPORATE_LEAD_REFERRED, aggregateType: "ProviderB2BReferral", aggregateId: r.id,
        payload: { referralId: r.id, orgRef: tenantId, clinicId: clinic.id, companyName: r.companyName, sizeBucket: r.sizeBucket, ...(r.contactRef ? { contactRef: r.contactRef } : {}), referredAt: r.createdAt.toISOString() },
      }, tx);
      return r;
    });
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: clinic.id, action: "growth.b2b.referred", resource: "ProviderB2BReferral", resourceId: row.id, metadata: { sizeBucket: row.sizeBucket } });
    return toDto(row);
  }

  async list(user: JwtUser) {
    const tenantId = this.who(user, "view");
    const rows = await this.prisma.providerB2BReferral.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
    return { items: rows.map(toDto), note: { reward: "NONE", message: "A company referral is tracking only: it earns no reward, credit or fee share." } };
  }

  async get(user: JwtUser, id: string) {
    const tenantId = this.who(user, "view");
    const r = await this.prisma.providerB2BReferral.findFirst({ where: { id, tenantId } });
    if (!r) throw new NotFoundException("Referral not found");
    return toDto(r);
  }
}
