import { randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { INTEGRATION_BEARER_PREFIX } from "./integration.types";

const CLIENT_KEY_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

export function generateClientKey(): string {
  let out = "ic_";
  const bytes = randomBytes(16);
  for (let i = 0; i < 20; i++) {
    out += CLIENT_KEY_CHARS[bytes[i % bytes.length]!];
  }
  return out;
}

export function generateClientSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function generateWebhookSigningSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function formatIntegrationBearerToken(clientKey: string, secret: string): string {
  return `${INTEGRATION_BEARER_PREFIX}${clientKey}.${secret}`;
}

export function parseIntegrationBearerToken(raw: string | undefined): { clientKey: string; secret: string } | null {
  const token = raw?.trim();
  if (!token?.startsWith(INTEGRATION_BEARER_PREFIX)) return null;
  const rest = token.slice(INTEGRATION_BEARER_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot <= 0) return null;
  const clientKey = rest.slice(0, dot);
  const secret = rest.slice(dot + 1);
  if (!clientKey.startsWith("ic_") || !secret) return null;
  return { clientKey, secret };
}

export async function hashIntegrationSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, 12);
}

export async function verifyIntegrationSecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}
