import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export const MAX_DISMISSED_KEYS = 50;
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/** Normalises a key list: trimmed strings of a safe shape, unique, at most MAX_DISMISSED_KEYS. Anything else is a 400. */
export function parseDismissedKeys(input: unknown): string[] {
  if (!Array.isArray(input)) throw new BadRequestException("keys must be an array of strings");
  const out = new Set<string>();
  for (const k of input) {
    if (typeof k !== "string" || !KEY_RE.test(k.trim())) throw new BadRequestException("keys must be short identifiers");
    out.add(k.trim());
  }
  if (out.size > MAX_DISMISSED_KEYS) throw new BadRequestException(`at most ${MAX_DISMISSED_KEYS} keys`);
  return [...out].sort();
}

/** Per-user UI preferences (dismissed cards) kept server-side so they follow the person across browsers. */
@Injectable()
export class UserPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getDismissed(userId: string): Promise<{ keys: string[] }> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { uiPrefs: true } });
    const raw = (u?.uiPrefs as { dismissedCards?: unknown } | null)?.dismissedCards;
    return { keys: Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [] };
  }

  async setDismissed(userId: string, keys: unknown): Promise<{ keys: string[] }> {
    const next = parseDismissedKeys(keys);
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { uiPrefs: true } });
    const base = u?.uiPrefs && typeof u.uiPrefs === "object" && !Array.isArray(u.uiPrefs) ? (u.uiPrefs as Record<string, unknown>) : {};
    await this.prisma.user.update({ where: { id: userId }, data: { uiPrefs: { ...base, dismissedCards: next } } });
    return { keys: next };
  }
}
