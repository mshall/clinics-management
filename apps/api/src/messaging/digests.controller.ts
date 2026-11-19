import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import type { DigestPrefsLike } from "./digest-policy";
import { DigestsService } from "./digests.service";

/** MS-04 — digest preferences and in-app notices. */
@ApiTags("messaging")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("digests")
export class DigestsController {
  constructor(private readonly digests: DigestsService) {}

  @Get("preferences")
  @ApiOperation({ summary: "Staff digest / CR-07 nudge preferences (quiet hours + opt-out)" })
  getPrefs(@CurrentUser() user: JwtUser) {
    return this.digests.getPreferences(requireTenantId(user), user.userId);
  }

  @Put("preferences")
  @ApiOperation({ summary: "Update digest preferences" })
  putPrefs(@CurrentUser() user: JwtUser, @Body() body: Partial<DigestPrefsLike>) {
    return this.digests.putPreferences(requireTenantId(user), user, body);
  }

  @Get("notices")
  @ApiOperation({ summary: "In-app digests and Kiorly-free progress notices" })
  notices(@CurrentUser() user: JwtUser, @Query("unreadOnly") unreadOnly?: string) {
    return this.digests.listNotices(requireTenantId(user), user.userId, { unreadOnly: unreadOnly === "true" || unreadOnly === "1" });
  }

  @Patch("notices/:id/read")
  @ApiOperation({ summary: "Mark an in-app notice as read" })
  markRead(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.digests.markNoticeRead(requireTenantId(user), user.userId, id);
  }
}
