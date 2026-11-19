import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient, SupportProductModule, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { SupportService } from "./support.service";
import { WhatsAppWebhookService } from "../messaging/whatsapp-webhook.service";
import { WhatsAppInboundRepliesService } from "../messaging/whatsapp-inbound-replies.service";
import { MessagingConsentService } from "../patients/messaging-consent.service";
import { AuditService } from "../audit/audit.service";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const support = new SupportService(prismaSvc);

describe("GT-04 support ops & first-response SLA", () => {
  const suffix = `gt04-${Date.now()}`;
  let owner: JwtUser;
  let agent: JwtUser;
  let tenantId: string;
  const prevSupportNum = process.env.KIORLY_SUPPORT_WHATSAPP_NUMBER;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `GT04 ${suffix}`,
        nameAr: `GT04 ${suffix}`,
        baseCurrency: "EGP",
        marketId: market.id,
        deploymentCell: "frankfurt",
      },
    });
    tenantId = tenant.id;
    process.env.SUPPORT_FALLBACK_TENANT_ID = tenantId;
    const ownerRow = await prisma.user.create({
      data: {
        tenantId,
        email: `owner-${suffix}@example.com`,
        passwordHash: "x",
        displayName: "Owner GT04",
        role: UserRole.GROUP_ADMIN,
        isTenantOwner: true,
      },
    });
    const agentRow = await prisma.user.create({
      data: {
        tenantId,
        email: `agent-${suffix}@example.com`,
        passwordHash: "x",
        displayName: "Agent GT04",
        role: UserRole.GROUP_ADMIN,
      },
    });
    owner = {
      userId: ownerRow.id,
      tenantId,
      email: ownerRow.email,
      role: UserRole.GROUP_ADMIN,
    };
    agent = {
      userId: agentRow.id,
      tenantId,
      email: agentRow.email,
      role: UserRole.GROUP_ADMIN,
    };
  });

  after(async () => {
    if (prevSupportNum === undefined) delete process.env.KIORLY_SUPPORT_WHATSAPP_NUMBER;
    else process.env.KIORLY_SUPPORT_WHATSAPP_NUMBER = prevSupportNum;
    delete process.env.SUPPORT_FALLBACK_TENANT_ID;
    await prisma.supportTicket.deleteMany({ where: { tenantId } });
    await prisma.whatsAppInboundEvent.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("records firstResponseDueAt and measures first response against SLA", async () => {
    const ticket = await support.createTicket(tenantId, owner, {
      title: "Cannot print receipt",
      description: "Thermal printer offline",
      module: SupportProductModule.BILLING,
      priority: "URGENT",
    });
    assert.ok(ticket);
    assert.ok(ticket.firstResponseDueAt);
    assert.equal(ticket.sla?.targetHours, 4);
    assert.equal(ticket.firstRespondedAt, null);

    const after = await support.addEvent(tenantId, agent, ticket.id, {
      eventType: "COMMENT",
      message: "Looking into printer config",
    });
    assert.ok(after);
    assert.ok(after.firstRespondedAt);
    assert.equal(typeof after.sla?.breached, "boolean");
    assert.ok((after.sla?.responseMinutes ?? -1) >= 0);
    assert.ok(after.events?.some((e) => e.eventType === "FIRST_RESPONSE"));
  });

  it("applies macros and escalates to engineering", async () => {
    const macros = support.listMacros();
    assert.ok(macros.some((m) => m.id === "ack_investigating"));
    const ticket = await support.createTicket(tenantId, owner, {
      title: "API 500 on reports",
      description: "Stack trace attached",
      module: SupportProductModule.REPORTS,
      priority: "HIGH",
    });
    assert.ok(ticket);
    const withMacro = await support.applyMacro(tenantId, agent, ticket.id, "ack_investigating");
    assert.ok(withMacro?.firstRespondedAt);
    const escalated = await support.escalateToEngineering(tenantId, agent, ticket.id, "Need backend look");
    assert.ok(escalated?.escalatedToEngineeringAt);
    assert.match(escalated?.engineeringEscalationNote ?? "", /backend/);
    assert.ok(escalated?.events?.some((e) => e.eventType === "ESCALATED_ENGINEERING"));
  });

  it("WhatsApp support line webhook creates a ticket", async () => {
    process.env.KIORLY_SUPPORT_WHATSAPP_NUMBER = "201000000099";
    const audit = { recordEvent: async () => undefined } as unknown as AuditService;
    const consent = { revokeAllWhatsAppForPhone: async () => 0 } as unknown as MessagingConsentService;
    const inbound = {} as WhatsAppInboundRepliesService;
    const webhook = new WhatsAppWebhookService(prismaSvc, audit, inbound, consent, support, {
      handleInboundText: async () => null,
    } as never);
    const msgId = `wamid.support.${suffix}`;
    const result = await webhook.handlePayload({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: "201000000099" },
                messages: [
                  {
                    id: msgId,
                    from: "201111111111",
                    type: "text",
                    text: { body: "Hello support — login fails" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    assert.equal(result.supportTickets, 1);
    const ticket = await prisma.supportTicket.findFirst({
      where: { tenantId, channel: "WHATSAPP", sourcePhone: "201111111111" },
    });
    assert.ok(ticket);
    assert.equal(ticket.priority, "URGENT");
    assert.ok(ticket.firstResponseDueAt);

    const again = await webhook.handlePayload({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: "201000000099" },
                messages: [
                  {
                    id: msgId,
                    from: "201111111111",
                    type: "text",
                    text: { body: "Hello support — login fails" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    assert.equal(again.supportTickets, 0);
  });
});
