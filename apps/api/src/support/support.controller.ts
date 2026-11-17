import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { NavTabAccessService } from "../user-nav-tabs/nav-tab-access.service";
import { assertSupportAccess, assertSupportMutate } from "./support-access";
import { CreateSupportTicketDto } from "./dto/create-support-ticket.dto";
import { CreateSupportTicketEventDto } from "./dto/create-support-ticket-event.dto";
import { PatchSupportTicketDto } from "./dto/patch-support-ticket.dto";
import { SupportService } from "./support.service";

@ApiTags("support")
@ApiBearerAuth("bearer")
@Controller("support")
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly navTabAccess: NavTabAccessService,
  ) {}

  @Get("tickets")
  @ApiOperation({ summary: "List customer support tickets" })
  @ApiOkResponse()
  async listTickets(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
    @Query("module") module?: string,
    @Query("q") q?: string,
    @Query("assigneeUserId") assigneeUserId?: string,
  ) {
    await assertSupportAccess(user, this.navTabAccess);
    return this.support.listTickets(requireTenantId(user), { page, pageSize, status, module, q, assigneeUserId });
  }

  @Get("tickets/:id")
  @ApiOperation({ summary: "Get support ticket detail" })
  @ApiOkResponse()
  async getTicket(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    await assertSupportAccess(user, this.navTabAccess);
    return this.support.getTicket(requireTenantId(user), id);
  }

  @Post("tickets")
  @ApiOperation({ summary: "Create support ticket" })
  @ApiOkResponse()
  async createTicket(@CurrentUser() user: JwtUser, @Body() body: CreateSupportTicketDto) {
    await assertSupportMutate(user, this.navTabAccess);
    return this.support.createTicket(requireTenantId(user), user, body);
  }

  @Patch("tickets/:id")
  @ApiOperation({ summary: "Update ticket status, priority, assignee" })
  @ApiOkResponse()
  async patchTicket(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: PatchSupportTicketDto) {
    await assertSupportMutate(user, this.navTabAccess);
    return this.support.patchTicket(requireTenantId(user), user, id, body);
  }

  @Post("tickets/:id/events")
  @ApiOperation({ summary: "Add comment or timeline event" })
  @ApiOkResponse()
  async addEvent(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: CreateSupportTicketEventDto) {
    await assertSupportMutate(user, this.navTabAccess);
    return this.support.addEvent(requireTenantId(user), user, id, body);
  }

  @Get("tracking/logs")
  @ApiOperation({ summary: "Detailed audit trail with resolution hints" })
  @ApiOkResponse()
  async trackingLogs(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
    @Query("action") action?: string,
    @Query("resource") resource?: string,
    @Query("actorId") actorId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("clinicId") clinicId?: string,
  ) {
    await assertSupportAccess(user, this.navTabAccess);
    return this.support.trackingLogs(requireTenantId(user), {
      page,
      pageSize,
      q,
      action,
      resource,
      actorId,
      from,
      to,
      clinicId,
    });
  }

  @Post("tracking/logs/:auditLogId/ticket")
  @ApiOperation({ summary: "Open ticket from audit log" })
  @ApiOkResponse()
  async ticketFromAudit(@CurrentUser() user: JwtUser, @Param("auditLogId") auditLogId: string) {
    await assertSupportMutate(user, this.navTabAccess);
    return this.support.createTicketFromAuditLog(requireTenantId(user), user, auditLogId);
  }
}