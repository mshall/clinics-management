import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { UserPreferencesService } from "./user-preferences.service";

/** The signed-in person's own preferences. No role check: it only ever touches the caller's row. */
@ApiTags("users")
@ApiBearerAuth("bearer")
@Controller("me/preferences")
@UseGuards(JwtAuthGuard)
export class UserPreferencesController {
  constructor(private readonly prefs: UserPreferencesService) {}

  @Get("dismissed-cards") @ApiOperation({ summary: "Cards this user dismissed (server-side, follows the user across browsers)" }) @ApiOkResponse()
  get(@CurrentUser() user: JwtUser) { return this.prefs.getDismissed(user.userId); }

  @Put("dismissed-cards") @ApiOperation({ summary: "Replace the list of dismissed card keys" }) @ApiOkResponse()
  put(@CurrentUser() user: JwtUser, @Body() body: { keys?: unknown }) { return this.prefs.setDismissed(user.userId, body?.keys); }
}
