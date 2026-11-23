import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { HandoffEntry, HandoffProduct, HandoffStore } from "./handoff";

/** PostgreSQL store: the code hash is unique, consumption is a single conditional UPDATE (no read-then-write race). */
@Injectable()
export class PrismaHandoffStore implements HandoffStore {
  constructor(private readonly prisma: PrismaService) {}
  async insert(e: HandoffEntry) { await this.prisma.handoffCode.create({ data: { codeHash: e.codeHash, product: e.product, edition: e.edition, origin: e.origin, subjectId: e.subjectId, expiresAt: e.expiresAt } }); }
  async consume(codeHash: string, now: Date): Promise<HandoffEntry | null> {
    const n = await this.prisma.handoffCode.updateMany({ where: { codeHash, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (n.count !== 1) return null;
    const r = await this.prisma.handoffCode.findUnique({ where: { codeHash } });
    return r ? { codeHash: r.codeHash, product: r.product as HandoffProduct, edition: r.edition, origin: r.origin, subjectId: r.subjectId, expiresAt: r.expiresAt } : null;
  }
  async purge(before: Date) { await this.prisma.handoffCode.deleteMany({ where: { expiresAt: { lt: before } } }); }
}
