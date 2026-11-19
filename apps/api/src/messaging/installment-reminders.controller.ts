import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import { InstallmentRemindersService } from "./installment-reminders.service";

/** MN-06 — desk resends an installment due reminder. */
@ApiTags("messaging")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement("mod_invoices")
@Controller("installment-reminders")
export class InstallmentRemindersController {
  constructor(private readonly reminders: InstallmentRemindersService) {}

  @Post(":installmentId")
  @ApiOperation({ summary: "Send the patient a WhatsApp reminder for an unpaid installment" })
  send(@CurrentUser() user: JwtUser, @Param("installmentId") installmentId: string) {
    return this.reminders.sendManual(requireTenantId(user), user, installmentId);
  }
}
