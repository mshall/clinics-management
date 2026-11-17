import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type Tx = Pick<Prisma.TransactionClient, "outboxEvent">;

@Injectable()
export class OutboxEventService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    tenantId: string,
    topic: string,
    payload: Record<string, unknown>,
    tx?: Tx,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.outboxEvent.create({
      data: {
        tenantId,
        topic,
        payloadJson: payload as Prisma.InputJsonValue,
        status: "PENDING",
      },
    });
  }
}