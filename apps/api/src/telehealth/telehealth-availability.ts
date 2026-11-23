import { ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { EntitlementsService } from "../entitlements/entitlements.service";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { requireFeature } from "../feature-flags/require-feature";

/** {"mon":[{"start":"09:00","end":"12:00"}],...} in clinic local time. Absent/empty = the doctor's normal availability applies. */
export type TelehealthWindows = Partial<Record<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat", { start: string; end: string }[]>>;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseTelehealthWindows(raw: unknown): TelehealthWindows | null {
  if (!raw || typeof raw !== "object") return null;
  const out: TelehealthWindows = {};
  for (const d of DAYS) {
    const arr = (raw as Record<string, unknown>)[d];
    if (!Array.isArray(arr)) continue;
    const ok = arr.filter((w): w is { start: string; end: string } => !!w && HHMM.test((w as { start?: string }).start ?? "") && HHMM.test((w as { end?: string }).end ?? "") && (w as { start: string }).start < (w as { end: string }).end);
    if (ok.length) out[d] = ok;
  }
  return Object.keys(out).length ? out : null;
}

function localParts(at: Date, tz: string): { day: (typeof DAYS)[number]; hhmm: string } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { day: String(p.weekday).slice(0, 3).toLowerCase() as (typeof DAYS)[number], hhmm: `${p.hour}:${p.minute}` };
}

/** True when [startsAt, endsAt) lies inside one of the doctor's telehealth windows (or no windows are configured). */
export function slotInsideWindows(windows: TelehealthWindows | null, tz: string, startsAt: Date, endsAt: Date): boolean {
  if (!windows) return true;
  const a = localParts(startsAt, tz);
  const b = localParts(new Date(endsAt.getTime() - 1), tz);
  if (a.day !== b.day) return false;
  return (windows[a.day] ?? []).some((w) => a.hhmm >= w.start && b.hhmm < w.end);
}

export async function loadTelehealthSetting(prisma: Pick<PrismaClient, "clinicianTelehealthSetting">, tenantId: string, clinicianId: string) {
  return prisma.clinicianTelehealthSetting.findFirst({ where: { tenantId, clinicianId } });
}

/** Flag + plan entitlement for NEW telehealth capability (booking, slots, creating sessions). Existing sessions never call this. */
export async function isTelehealthEnabled(flags: FeatureFlagsService | undefined, entitlements: EntitlementsService | undefined, tenantId: string): Promise<boolean> {
  if (flags && !(await flags.evaluate(tenantId, "telehealth.video")).effective) return false;
  if (entitlements && !(await entitlements.isEntitled(tenantId, "telehealth_video"))) return false;
  return true;
}

export async function assertTelehealthBookable(
  deps: { prisma: PrismaClient; flags?: FeatureFlagsService; entitlements?: EntitlementsService },
  tenantId: string,
  clinicianId: string,
): Promise<void> {
  if (deps.flags) await requireFeature(deps.flags, tenantId, "telehealth.video");
  if (deps.entitlements) await deps.entitlements.requireEntitlement(tenantId, "telehealth_video");
  const s = await loadTelehealthSetting(deps.prisma, tenantId, clinicianId);
  if (!s?.offersTelehealth) throw new ForbiddenException({ code: "TELEHEALTH_NOT_OFFERED", message: "This doctor does not offer telehealth" });
}

export async function telehealthOfferedBy(
  deps: { prisma: PrismaClient; flags?: FeatureFlagsService; entitlements?: EntitlementsService },
  tenantId: string,
  clinicianId: string,
): Promise<boolean> {
  if (!(await isTelehealthEnabled(deps.flags, deps.entitlements, tenantId))) return false;
  return Boolean((await loadTelehealthSetting(deps.prisma, tenantId, clinicianId))?.offersTelehealth);
}

export async function filterTelehealthSlots<T extends { startsAt: string | Date; endsAt: string | Date }>(
  prisma: PrismaClient,
  tenantId: string,
  clinicId: string,
  clinicianId: string,
  slots: T[],
): Promise<T[]> {
  const [setting, clinic] = await Promise.all([loadTelehealthSetting(prisma, tenantId, clinicianId), prisma.clinic.findFirst({ where: { id: clinicId, tenantId }, select: { timezone: true } })]);
  const windows = parseTelehealthWindows(setting?.windowsJson);
  const tz = clinic?.timezone || "Africa/Cairo";
  return slots.filter((s) => slotInsideWindows(windows, tz, new Date(s.startsAt), new Date(s.endsAt)));
}
