import type { PrismaService } from "../prisma/prisma.service";

/** Clinic IANA timezone for scheduling UI rules (stored appointment instants remain UTC). */
export async function resolveClinicTimezone(
  prisma: PrismaService,
  tenantId: string,
  clinicId: string,
): Promise<string> {
  const clinic = await prisma.clinic.findFirst({
    where: { id: clinicId, tenantId },
    select: { timezone: true },
  });
  if (clinic?.timezone?.trim()) return clinic.timezone.trim();
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { market: { select: { defaultTimezone: true } } },
  });
  return tenant?.market?.defaultTimezone?.trim() || "UTC";
}