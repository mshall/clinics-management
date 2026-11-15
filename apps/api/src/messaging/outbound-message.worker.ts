import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MessageChannel } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { sendWhatsAppMessage } from "./whatsapp.provider";

const POLL_MS = 15_000;
const BATCH = 25;

@Injectable()
export class OutboundMessageWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboundMessageWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.processBatch().catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    }, POLL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processBatch(): Promise<void> {
    const rows = await this.prisma.outboundMessage.findMany({
      where: { status: "QUEUED" },
      orderBy: { createdAt: "asc" },
      take: BATCH,
    });
    for (const row of rows) {
      if (row.channel === MessageChannel.WHATSAPP) {
        const result = await sendWhatsAppMessage(row.toPhone, row.body);
        await this.prisma.outboundMessage.update({
          where: { id: row.id },
          data: result.ok
            ? { status: "SENT", sentAt: new Date(), error: null }
            : { status: "FAILED", error: result.error },
        });
      } else {
        await this.prisma.outboundMessage.update({
          where: { id: row.id },
          data: {
            status: process.env.NODE_ENV === "production" ? "FAILED" : "SENT",
            sentAt: new Date(),
            error: process.env.NODE_ENV === "production" ? "SMS provider not configured" : null,
          },
        });
      }
    }
  }
}