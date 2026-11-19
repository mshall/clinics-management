import { Body, Controller, Delete, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { UpsertPushSubscriptionDto } from "./dto/upsert-push-subscription.dto";
import { PushService } from "./push.service";

@ApiTags("push")
@ApiBearerAuth("bearer")
@Controller("push")
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get("subscriptions")
  @ApiOperation({ summary: "List this user's web push subscriptions (UX-01)" })
  @ApiOkResponse()
  list(@CurrentUser() user: JwtUser) {
    return this.push.listForUser(requireTenantId(user), user.userId);
  }

  @Post("subscriptions")
  @ApiOperation({ summary: "Register or refresh a web push subscription (UX-01)" })
  @ApiOkResponse()
  upsert(@CurrentUser() user: JwtUser, @Body() body: UpsertPushSubscriptionDto) {
    return this.push.upsert(requireTenantId(user), user.userId, body);
  }

  @Delete("subscriptions")
  @ApiOperation({ summary: "Remove a web push subscription by endpoint" })
  @ApiOkResponse()
  remove(@CurrentUser() user: JwtUser, @Query("endpoint") endpoint: string) {
    return this.push.remove(requireTenantId(user), user.userId, endpoint ?? "");
  }
}
