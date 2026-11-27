import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { hashIntegrationSecret, verifyIntegrationSecret } from "../integrations/integration-token";

export interface MarketplaceClientBootstrapConfig { clientKey: string; secret: string }

/**
 * Registration of the Kiorex platform's marketplace client from deployment configuration (kx-test onwards). Env-driven and OFF unless BOTH
 * `KIOREX_MARKETPLACE_CLIENT_KEY` and `KIOREX_MARKETPLACE_CLIENT_SECRET` are set (the values come from the secret store by reference, the
 * same pair the platform holds as KIORLY_CLIENT_KEY / KIORLY_CLIENT_SECRET). There is no admin screen for this client yet.
 *
 *  - creates the `PlatformIntegrationClient` (scope MARKETPLACE) when the key is unknown;
 *  - when the key exists and the secret differs, replaces the stored hash (rotation by configuration);
 *  - NEVER reactivates a client someone deactivated on purpose, and never touches any other client or any tenant data;
 *  - never throws: a database hiccup must not stop the API from booting (the next boot retries); the secret is never logged.
 */
export function readMarketplaceClientBootstrap(env: NodeJS.ProcessEnv = process.env): MarketplaceClientBootstrapConfig | null {
  const clientKey = env.KIOREX_MARKETPLACE_CLIENT_KEY?.trim();
  const secret = env.KIOREX_MARKETPLACE_CLIENT_SECRET?.trim();
  if (!clientKey || !secret) return null;
  if (clientKey.length < 8 || secret.length < 24) return null; // a placeholder or truncated value is not a credential
  return { clientKey, secret };
}

export type MarketplaceClientBootstrapResult = "off" | "created" | "rotated" | "unchanged" | "deactivated-left-alone";

@Injectable()
export class MarketplaceClientBootstrapService implements OnApplicationBootstrap {
  private readonly log = new Logger(MarketplaceClientBootstrapService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const r = await this.ensure();
      if (r !== "off") this.log.log(`[marketplace-client] ${r}`);
    } catch (e) {
      this.log.warn(`[marketplace-client] not applied: ${e instanceof Error ? e.name : "error"}`);
    }
  }

  async ensure(cfg: MarketplaceClientBootstrapConfig | null = readMarketplaceClientBootstrap()): Promise<MarketplaceClientBootstrapResult> {
    if (!cfg) return "off";
    const row = await this.prisma.platformIntegrationClient.findFirst({ where: { clientKey: cfg.clientKey } });
    if (!row) {
      await this.prisma.platformIntegrationClient.create({
        data: { name: "Kiorex platform (configured)", clientKey: cfg.clientKey, secretHash: await hashIntegrationSecret(cfg.secret), scopes: ["MARKETPLACE"] },
      });
      return "created";
    }
    if (row.deactivatedAt) return "deactivated-left-alone";
    if (await verifyIntegrationSecret(cfg.secret, row.secretHash)) return "unchanged";
    await this.prisma.platformIntegrationClient.update({ where: { id: row.id }, data: { secretHash: await hashIntegrationSecret(cfg.secret) } });
    return "rotated";
  }
}
