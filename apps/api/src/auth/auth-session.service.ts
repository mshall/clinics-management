import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

const REFRESH_TTL_MS = 30 * 86_400_000;

export type SessionMeta = { userAgent?: string; ipHash?: string };

@Injectable()
export class AuthSessionService {
  constructor(private readonly prisma: PrismaService) {}

  private hashRefreshToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  async createSession(userId: string, meta: SessionMeta = {}): Promise<{ sessionId: string; refreshToken: string }> {
    const refreshToken = randomBytes(32).toString("base64url");
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const row = await this.prisma.userSession.create({
      data: {
        userId,
        refreshTokenHash,
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        ipHash: meta.ipHash ?? null,
      },
    });
    return { sessionId: row.id, refreshToken };
  }

  async rotateRefresh(refreshToken: string): Promise<{ sessionId: string; refreshToken: string; userId: string }> {
    const hash = this.hashRefreshToken(refreshToken);
    const existing = await this.prisma.userSession.findFirst({
      where: {
        refreshTokenHash: hash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!existing) throw new UnauthorizedException("Invalid or expired session");

    const newRefresh = randomBytes(32).toString("base64url");
    const newHash = this.hashRefreshToken(newRefresh);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.userSession.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      return tx.userSession.create({
        data: {
          userId: existing.userId,
          refreshTokenHash: newHash,
          expiresAt,
          userAgent: existing.userAgent,
          ipHash: existing.ipHash,
        },
      });
    });

    return { sessionId: created.id, refreshToken: newRefresh, userId: existing.userId };
  }

  async assertSessionActive(sessionId: string, userId: string): Promise<void> {
    const row = await this.prisma.userSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row) throw new UnauthorizedException("Session expired");
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { lastSeenAt: new Date() },
    });
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const rows = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      userAgent: r.userAgent,
      current: currentSessionId === r.id,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const row = await this.prisma.userSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });
    if (!row) return;
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}