import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OUTBOX_STATUS, OUTBOX_TARGET_INTERNAL, OUTBOX_TARGET_KIOREX } from "./outbox-event-types";

export { OUTBOX_TARGET_INTERNAL };

type Tx = Pick<Prisma.TransactionClient, "outboxEvent">;

export type OutboxEnqueueInput = {
  tenantId: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  target?: string;
};

@Injectable()
export class OutboxEventService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueEvent(input: OutboxEnqueueInput, tx?: Tx): Promise<string> {
    const client = tx ?? this.prisma;
    const row = await client.outboxEvent.create({
      data: {
        tenantId: input.tenantId,
        type: input.type,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: {
          ...input.payload,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
        } as Prisma.InputJsonValue,
        target: input.target ?? OUTBOX_TARGET_KIOREX,
        status: OUTBOX_STATUS.PENDING,
        attempts: 0,
        nextAttemptAt: new Date(),
      },
      select: { id: true },
    });
    return row.id;
  }

  /** Backward-compatible enqueue (maps topic → type, infers aggregate). */
  async enqueue(
    tenantId: string,
    topic: string,
    payload: Record<string, unknown>,
    tx?: Tx,
    target?: string,
  ): Promise<void> {
    const aggregateId = String(
      payload.appointmentId ??
        payload.listingId ??
        payload.chargeId ??
        payload.clinicianId ??
        tenantId,
    );
    const aggregateType = payload.appointmentId
      ? "Appointment"
      : payload.listingId
        ? "MarketplaceListing"
        : payload.chargeId
          ? "KiorexCommissionCharge"
          : payload.clinicId
            ? "Clinic"
            : "Tenant";
    await this.enqueueEvent(
      {
        tenantId,
        type: topic,
        aggregateType,
        aggregateId,
        payload,
        target,
      },
      tx,
    );
  }
}