import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import { WhatsAppAiReceptionistService } from "./whatsapp-ai-receptionist.service";

/** MS-06 — AI receptionist conversation inbox. */
@ApiTags("messaging")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement("mod_messaging")
@Controller("messaging/ai-receptionist")
export class WhatsAppAiReceptionistController {
  constructor(private readonly receptionist: WhatsAppAiReceptionistService) {}

  @Get("inbox")
  @ApiOperation({ summary: "WhatsApp AI receptionist conversation turns" })
  inbox(
    @CurrentUser() user: JwtUser,
    @Query("handedOverOnly") handedOverOnly?: string,
    @Query("limit") limit?: string,
  ) {
    return this.receptionist.listInbox(requireTenantId(user), {
      handedOverOnly: handedOverOnly === "true",
      limit: limit ? Number(limit) : undefined,
    });
  }
}
