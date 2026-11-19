import type { Prisma, PrismaClient } from "@prisma/client";

export type DevInboxRecordInput = {
  channel: "EMAIL" | "WHATSAPP" | "SMS" | "PUSH";
  direction?: "OUT" | "IN";
  tenantId?: string | null;
  toAddress: string;
  fromAddress?: string | null;
  templateKey?: string | null;
  subject?: string | null;
  bodyText: string;
  bodyHtml?: string | null;
  variables?: Record<string, unknown> | null;
  quickReplies?: string[] | null;
  documentLink?: string | null;
  providerMessageId?: string | null;
  relatedId?: string | null;
  status?: string;
};

/**
 * Static, best-effort writer used by the mock adapters (which are plain functions/classes, not Nest providers).
 * `DevInboxService.onModuleInit` binds the Prisma client; unbound (unit tests) it is a no-op. It never throws:
 * a dev-inbox failure must not break the flow it observes. Callers only invoke it in mock mode.
 */
export class DevInboxRecorder {
  private static prisma: PrismaClient | null = null;

  static bind(prisma: PrismaClient | null): void {
    DevInboxRecorder.prisma = prisma;
  }

  static async record(input: DevInboxRecordInput): Promise<string | null> {
    const db = DevInboxRecorder.prisma;
    if (!db) return null;
    try {
      const status = input.status ?? (input.direction === "IN" ? "RECEIVED" : "SENT");
      const row = await db.devInboxMessage.create({
        data: {
          channel: input.channel,
          direction: input.direction ?? "OUT",
          tenantId: input.tenantId ?? null,
          toAddress: input.toAddress,
          fromAddress: input.fromAddress ?? null,
          templateKey: input.templateKey ?? null,
          subject: input.subject ?? null,
          bodyText: input.bodyText,
          bodyHtml: input.bodyHtml ?? null,
          variablesJson: (input.variables ?? undefined) as Prisma.InputJsonValue | undefined,
          quickReplies: (input.quickReplies ?? undefined) as Prisma.InputJsonValue | undefined,
          documentLink: input.documentLink ?? null,
          providerMessageId: input.providerMessageId ?? null,
          relatedId: input.relatedId ?? null,
          status,
          statusHistory: [{ status, at: new Date().toISOString() }] as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return row.id;
    } catch {
      return null;
    }
  }
}
