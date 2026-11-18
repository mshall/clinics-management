import { randomBytes } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  generateClientKey,
  generateClientSecret,
  hashIntegrationSecret,
  verifyIntegrationSecret,
} from "../integrations/integration-token";

export type PlatformIntegrationPrincipal = {
  id: string;
  clientKey: string;
  name: string;
  scopes: string[];
  ipAllowlist: string[];
};

@Injectable()
export class PlatformIntegrationClientService {
  private readonly seenNonces = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  generateClientKey(): string {
    return `ic_plt_${randomBytes(12).toString("base64url")}`;
  }

  async createClient(name: string): Promise<{ clientKey: string; secret: string; id: string }> {
    const clientKey = this.generateClientKey();
    const secret = generateClientSecret();
    const secretHash = await hashIntegrationSecret(secret);
    const row = await this.prisma.platformIntegrationClient.create({
      data: { name, clientKey, secretHash, scopes: ["MARKETPLACE"] },
    });
    return { clientKey, secret, id: row.id };
  }

  async authenticate(clientKey: string, secret: string): Promise<PlatformIntegrationPrincipal> {
    const row = await this.prisma.platformIntegrationClient.findFirst({
      where: { clientKey, deactivatedAt: null },
    });
    if (!row) throw new UnauthorizedException("Unknown marketplace client");
    const ok = await verifyIntegrationSecret(secret, row.secretHash);
    if (!ok) throw new UnauthorizedException("Invalid marketplace client secret");
    void this.prisma.platformIntegrationClient
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return {
      id: row.id,
      clientKey: row.clientKey,
      name: row.name,
      scopes: row.scopes ?? ["MARKETPLACE"],
      ipAllowlist: row.ipAllowlist ?? [],
    };
  }

  assertNonce(clientId: string, nonce: string): void {
    const key = `${clientId}:${nonce}`;
    const now = Date.now();
    if (this.seenNonces.has(key)) throw new UnauthorizedException("Replayed nonce");
    this.seenNonces.set(key, now);
    for (const [k, at] of this.seenNonces) {
      if (now - at > 10 * 60 * 1000) this.seenNonces.delete(k);
    }
  }

  assertIpAllowed(principal: PlatformIntegrationPrincipal, ip: string | undefined): void {
    const list = principal.ipAllowlist?.filter(Boolean) ?? [];
    if (!list.length) return;
    const normalized = ip?.trim() || "";
    if (!normalized || !list.includes(normalized)) {
      throw new UnauthorizedException("Client IP not allowlisted");
    }
  }
}