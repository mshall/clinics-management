import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PaymentMethod } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { BillingService } from "./billing.service";

@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("catalog")
  listCatalog(@CurrentUser() user: JwtUser, @Query("q") q?: string) {
    return this.billing.listCatalog(requireTenantId(user), q);
  }

  @Post("catalog")
  createCatalog(
    @CurrentUser() user: JwtUser,
    @Body() body: { code: string; nameEn: string; nameAr?: string; category?: string; amount: number; currency?: string },
  ) {
    return this.billing.createCatalogItem(requireTenantId(user), user, body);
  }

  @Post("payments")
  recordPayment(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      clinicId: string;
      patientId: string;
      invoiceId?: string;
      currency?: string;
      allocations: { method: PaymentMethod; amount: number }[];
      submitEta?: boolean;
    },
  ) {
    return this.billing.recordPayment(requireTenantId(user), user, body);
  }

  @Post("cash-close")
  cashClose(
    @CurrentUser() user: JwtUser,
    @Body()
    body: { clinicId: string; shiftDate: string; countedCash: number; countedCard: number; notes?: string },
  ) {
    return this.billing.closeCashierShift(requireTenantId(user), user, body);
  }
}
