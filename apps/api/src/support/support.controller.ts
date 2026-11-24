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
import { SupportAccessSessionService } from "./support-access-session.service";
import { SupportEscalateEngineeringBodyDto, SupportRequestAccessBodyDto, SupportDecideAccessBodyDto } from "./support.controller.dto";

@ApiTags("support")
@ApiBearerAuth("bearer")
@Controller("support")
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly navTabAccess: NavTabAccessService,
    private readonly accessSessions: SupportAccessSessionService,
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

  @Get("macros")
  @ApiOperation({ summary: "GT-04 — canned support reply macros" })
  @ApiOkResponse()
  async listMacros(@CurrentUser() user: JwtUser) {
    await assertSupportAccess(user, this.navTabAccess);
    return this.support.listMacros();
  }

  @Post("tickets/:id/macros/:macroId")
  @ApiOperation({ summary: "GT-04 — apply a reply macro (counts as first response)" })
  @ApiOkResponse()
  async applyMacro(@CurrentUser() user: JwtUser, @Param("id") id: string, @Param("macroId") macroId: string) {
    await assertSupportMutate(user, this.navTabAccess);
    return this.support.applyMacro(requireTenantId(user), user, id, macroId);
  }

  @Post("tickets/:id/escalate-engineering")
  @ApiOperation({ summary: "GT-04 — escalate ticket to engineering" })
  @ApiOkResponse()
  async escalateEngineering(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: SupportEscalateEngineeringBodyDto,
  ) {
    await assertSupportMutate(user, this.navTabAccess);
    return this.support.escalateToEngineering(requireTenantId(user), user, id, body?.note);
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

  @Post("access-requests")
  @ApiOperation({ summary: "PA-04 — platform support requests time-boxed tenant access" })
  @ApiOkResponse()
  requestAccess(
    @CurrentUser() user: JwtUser,
    @Body()
    body: SupportRequestAccessBodyDto,
  ) {
    return this.accessSessions.requestAccess(user, body);
  }

  @Get("access-requests/mine")
  @ApiOperation({ summary: "PA-04 — list my platform support access requests" })
  @ApiOkResponse()
  listMyAccessRequests(@CurrentUser() user: JwtUser) {
    return this.accessSessions.listMine(user);
  }

  @Get("access-requests")
  @ApiOperation({ summary: "PA-04 — owner lists pending/prior support access requests" })
  @ApiOkResponse()
  listTenantAccessRequests(@CurrentUser() user: JwtUser) {
    return this.accessSessions.listForTenant(user, requireTenantId(user));
  }

  @Post("access-requests/:id/decide")
  @ApiOperation({ summary: "PA-04 — owner approves or denies support access" })
  @ApiOkResponse()
  decideAccess(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: SupportDecideAccessBodyDto,
  ) {
    return this.accessSessions.decide(user, id, body);
  }

  @Post("access-requests/:id/revoke")
  @ApiOperation({ summary: "PA-04 — revoke a support access session" })
  @ApiOkResponse()
  revokeAccess(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.accessSessions.revoke(user, id);
  }

  @Get("access-sessions/patients/:patientId")
  @ApiOperation({
    summary: "PA-04 — open patient chart under an active approved support session (PHI masked by default)",
  })
  @ApiOkResponse()
  openPatientChart(
    @CurrentUser() user: JwtUser,
    @Param("patientId") patientId: string,
    @Query("tenantId") tenantId: string,
  ) {
    return this.accessSessions.openPatientChart(user, tenantId, patientId);
  }
}