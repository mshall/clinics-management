import { Injectable } from "@nestjs/common";
import { Prisma, TelehealthRole, type TelehealthSignalType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { SignalMessage, SignalingTransport } from "./signaling-transport";

@Injectable()
export class HttpPollingSignaling implements SignalingTransport {
  constructor(private readonly prisma: PrismaService) {}

  async publish(sessionId: string, from: TelehealthRole, type: TelehealthSignalType, payload: unknown): Promise<{ seq: number }> {
    // Incrementing the session counter row-locks it, so seq is strictly monotonic per session even under concurrent posts.
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.telehealthSession.update({ where: { id: sessionId }, data: { signalSeq: { increment: 1 } }, select: { signalSeq: true } });
      await tx.telehealthSignal.create({ data: { sessionId, fromRole: from, type, payload: (payload ?? {}) as Prisma.InputJsonValue, seq: s.signalSeq } });
      return { seq: s.signalSeq };
    });
  }

  async fetch(sessionId: string, forRole: TelehealthRole, afterSeq: number, limit = 100): Promise<SignalMessage[]> {
    const rows = await this.prisma.telehealthSignal.findMany({
      where: { sessionId, seq: { gt: afterSeq }, fromRole: forRole === TelehealthRole.CLINICIAN ? TelehealthRole.PATIENT : TelehealthRole.CLINICIAN },
      orderBy: { seq: "asc" },
      take: limit,
    });
    return rows.map((r) => ({ seq: r.seq, fromRole: r.fromRole, type: r.type, payload: r.payload, createdAt: r.createdAt.toISOString() }));
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    return (await this.prisma.telehealthSignal.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
  }
}
