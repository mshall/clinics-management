import { Prisma, type ProviderReferralLink } from "@prisma/client";

/**
 * Clinic side of the Clinic -> Kiorex link registry (contracts 1.11.0, ARCH 4.2/6.4): the Clinic owns link codes, Kiorex learns the code -> organisation mapping
 * from `ReferralLinkCreated` and `ReferralLinkRevoked` (outbox, target KIOREX, organisation reference in the payload) and can read any code back through the signed
 * marketplace lookup (`GET /marketplace/v1/referral-links/{code}`). Payloads carry the code, scope, channel and ids only: never a person.
 */
export const REFERRAL_LINK_CREATED = "ReferralLinkCreated";
export const REFERRAL_LINK_REVOKED = "ReferralLinkRevoked";

export interface ReferralLinkRecord {
  code: string;
  orgRef: string;
  clinicRef: string | null;
  ownerScope: string;
  channelKind: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export function toReferralLinkRecord(l: Pick<ProviderReferralLink, "code" | "tenantId" | "clinicId" | "ownerScope" | "channelKind" | "status" | "createdAt" | "updatedAt" | "revokedAt">): ReferralLinkRecord {
  return {
    code: l.code,
    orgRef: l.tenantId,
    clinicRef: l.clinicId ?? null,
    ownerScope: l.ownerScope,
    channelKind: l.channelKind,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    revokedAt: l.revokedAt ? l.revokedAt.toISOString() : null,
  };
}

type OutboxClient = { outboxEvent: Pick<Prisma.TransactionClient["outboxEvent"], "create"> };

/** Queue the registry event for Kiorex (same outbox, retry and signature as every other Clinic event). */
export async function enqueueLinkEvent(
  client: OutboxClient,
  type: typeof REFERRAL_LINK_CREATED | typeof REFERRAL_LINK_REVOKED,
  link: Pick<ProviderReferralLink, "id" | "code" | "tenantId" | "clinicId" | "ownerScope" | "channelKind" | "createdAt" | "revokedAt">,
  reason?: string,
): Promise<void> {
  const aggregateType = "ProviderReferralLink";
  const data: Record<string, unknown> =
    type === REFERRAL_LINK_CREATED
      ? { linkCode: link.code, ownerScope: link.ownerScope, channelKind: link.channelKind, orgRef: link.tenantId, clinicRef: link.clinicId ?? null, createdAt: link.createdAt.toISOString() }
      : { linkCode: link.code, orgRef: link.tenantId, clinicRef: link.clinicId ?? null, revokedAt: (link.revokedAt ?? new Date()).toISOString(), ...(reason ? { reason } : {}) };
  await client.outboxEvent.create({
    data: {
      tenantId: link.tenantId,
      type,
      aggregateType,
      aggregateId: link.id,
      payload: { ...data, aggregateType, aggregateId: link.id } as Prisma.InputJsonValue,
      target: "KIOREX",
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
    },
  });
}
