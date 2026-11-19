import { createHash, randomBytes } from "node:crypto";
import type { PrismaService } from "../prisma/prisma.service";

const DEFAULT_TOKEN_TTL_DAYS = 14;

export function hashRxToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function rxWebBase(): string {
  return (process.env.APP_WEB_URL?.trim() || "http://localhost:5173").replace(/\/$/, "");
}

/** Pack `clinicalConfig.rxVerification.tokenTtlDays`; code default 14 days. */
export function rxTokenTtlDays(clinicalConfig: unknown): number {
  const cfg = clinicalConfig && typeof clinicalConfig === "object" ? (clinicalConfig as Record<string, unknown>) : {};
  const rx = cfg.rxVerification && typeof cfg.rxVerification === "object" ? (cfg.rxVerification as Record<string, unknown>) : {};
  const days = Number(rx.tokenTtlDays);
  return Number.isFinite(days) && days >= 1 && days <= 90 ? Math.floor(days) : DEFAULT_TOKEN_TTL_DAYS;
}

export function rxPdfUrl(raw: string): string {
  return `${rxWebBase()}/api/v1/public/rx/verify/${encodeURIComponent(raw)}/pdf`;
}

/** Mint a public verification/PDF token for a signed Rx (shared by print, WhatsApp send and the Kiorex push). */
export async function mintRxVerificationToken(
  prisma: PrismaService,
  tenantId: string,
  encounterId: string,
  userId: string | null,
): Promise<{ raw: string; expiresAt: Date }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { market: { select: { clinicalConfig: true } } },
  });
  const ttlDays = rxTokenTtlDays(tenant?.market?.clinicalConfig);
  const raw = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
  await prisma.prescriptionVerificationToken.create({
    data: { tenantId, encounterId, tokenHash: hashRxToken(raw), expiresAt, createdByUserId: userId },
  });
  return { raw, expiresAt };
}
