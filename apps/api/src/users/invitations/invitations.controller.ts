import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { UserRole } from "@prisma/client";
import { CurrentUser } from "../../auth/current-user.decorator";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import type { JwtUser } from "../../auth/jwt-user";
import { requireTenantId } from "../../auth/require-tenant";
import { assertCanInvite, InvitationsService } from "./invitations.service";

@ApiTags("invitations")
@ApiBearerAuth("bearer")
@Controller("invitations")
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @ApiOperation({ summary: "Staff invitations for the team screen (ON-06)" })
  list(@CurrentUser() user: JwtUser) {
    assertCanInvite(user);
    return this.invitations.list(requireTenantId(user));
  }

  @Post()
  @ApiOperation({ summary: "Invite staff by WhatsApp or email (402 when over seat limit)" })
  create(
    @CurrentUser() user: JwtUser,
    @Body() body: { phoneOrEmail: string; roles: UserRole[]; displayName?: string; clinicIds?: string[] },
  ) {
    return this.invitations.create(user, requireTenantId(user), body);
  }

  @Post(":id/resend")
  @HttpCode(HttpStatus.OK)
  resend(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.invitations.resend(user, requireTenantId(user), id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Revoke a pending invitation" })
  revoke(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.invitations.revoke(user, requireTenantId(user), id);
  }
}

@ApiTags("public")
@Controller("public/invitations")
export class PublicInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get(":token")
  @ApiOperation({ summary: "Invitation details for the accept page" })
  view(@Param("token") token: string) {
    return this.invitations.publicView(token);
  }

  @Post(":token/accept")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Accept invitation and set password" })
  accept(@Param("token") token: string, @Body() body: { password: string; email?: string; displayName?: string }) {
    return this.invitations.accept(token, body);
  }
}
