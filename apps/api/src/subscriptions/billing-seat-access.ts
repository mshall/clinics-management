import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";

export class BillingSeatInactiveException extends ForbiddenException {
  constructor() {
    super({
      code: "BILLING_SEAT_INACTIVE",
      message: "This clinician is read-only until your clinic owner restores a paid seat.",
    });
  }
}

export async function assertClinicianBillingSeatActive(
  prisma: PrismaService,
  tenantId: string,
  clinicianUserId: string,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: clinicianUserId, tenantId, deletedAt: null },
    select: { billingSeatActive: true, role: true },
  });
  if (!user) return;
  if (user.role !== "PHYSICIAN") return;
  if (user.billingSeatActive === false) {
    throw new BillingSeatInactiveException();
  }
}