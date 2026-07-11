import type { PrismaService } from "../prisma/prisma.service";

type DbClient = Pick<PrismaService, "clinic">;

export async function resolveClinicCurrency(
  client: DbClient,
  tenantId: string,
  clinicId: string,
): Promise<string> {
  const clinic = await client.clinic.findFirst({
    where: { id: clinicId, tenantId },
    select: { defaultCurrency: true, tenant: { select: { baseCurrency: true } } },
  });
  return clinic?.defaultCurrency ?? clinic?.tenant.baseCurrency ?? "AED";
}
