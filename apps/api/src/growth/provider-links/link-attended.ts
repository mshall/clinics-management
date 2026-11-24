import type { Prisma } from "@prisma/client";
import { bumpLinkCounter } from "./link-counters";
import { normalizeLinkCode } from "./link-code";

/**
 * First attended check-in of an appointment that was booked through a provider link counts once on that link's day row (`attended`). Marked on the
 * appointment's display JSON so a check-in revert and redo never double counts. Independent of commission settings: provider-led visits count too.
 */
export async function recordLinkAttended(
  tx: Prisma.TransactionClient,
  appt: { id: string; tenantId: string; attributionJson: Prisma.JsonValue | null },
  at: Date,
): Promise<boolean> {
  const json = appt.attributionJson && typeof appt.attributionJson === "object" && !Array.isArray(appt.attributionJson) ? (appt.attributionJson as Record<string, unknown>) : null;
  const code = normalizeLinkCode(json?.referralLinkCode);
  if (!json || !code || json.referralLinkAttended === true) return false;
  const link = await tx.providerReferralLink.findFirst({ where: { code, tenantId: appt.tenantId }, select: { id: true, tenantId: true } });
  if (!link) return false;
  await bumpLinkCounter(tx, link, "attended", at);
  await tx.appointment.update({ where: { id: appt.id }, data: { attributionJson: { ...json, referralLinkAttended: true } as Prisma.InputJsonValue } });
  return true;
}
