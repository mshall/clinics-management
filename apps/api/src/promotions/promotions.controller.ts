import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { effectiveRoles } from "../common/effective-roles";
import { FeatureGuard, RequiresFeature } from "../feature-flags/feature-flags-public";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { Lenient } from "../common/lenient-dto";
import { PromotionService, type VersionBody } from "./promotion.service";

@Lenient()
export class PausePromotionDto { @IsOptional() @IsString() @MaxLength(200) reason?: string }

const READ: UserRole[] = [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.FINANCE_OFFICER, UserRole.BRANCH_MANAGER];
const WRITE: UserRole[] = [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN];

/** Owner console of provider-sponsored promotions (GRW-P2-S). The clinic funds the discount from its own provider credit; nothing here touches a patient credit object. Gated by clinic.provider_credit_v2 (the wallet use "promotions"). */
@ApiTags("promotions")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, FeatureGuard)
@RequiresFeature("clinic.provider_credit_v2")
@Controller("promotions")
export class PromotionsController {
  constructor(private readonly svc: PromotionService) {}
  private canRead(u: JwtUser) { if (!(u.isTenantOwner || effectiveRoles(u).some((r) => READ.includes(r)))) throw new ForbiddenException("Only the owner and finance roles can read promotions"); }
  private canWrite(u: JwtUser) { if (!(u.isTenantOwner || effectiveRoles(u).some((r) => WRITE.includes(r)))) throw new ForbiddenException("Only the owner and administrators can manage promotions"); }
  private actor(u: JwtUser) { return { userId: u.userId, tenantId: requireTenantId(u) }; }

  @Get() @ApiOperation({ summary: "My promotions with status and budget" })
  list(@CurrentUser() u: JwtUser) { this.canRead(u); return this.svc.list(requireTenantId(u)); }
  @Get(":id") @ApiOperation({ summary: "One promotion: current version, budget (reserved, debited, remaining), reservations by state, reviews" })
  get(@CurrentUser() u: JwtUser, @Param("id") id: string) { this.canRead(u); return this.svc.get(requireTenantId(u), id); }
  @Get(":id/ledger") @ApiOperation({ summary: "The append-only budget ledger of a promotion (reserve, release, debit, reversal), newest first" })
  ledger(@CurrentUser() u: JwtUser, @Param("id") id: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) { this.canRead(u); return this.svc.ledger(requireTenantId(u), id, page ? Number(page) : 1, pageSize ? Number(pageSize) : 50); }

  @Post() @ApiOperation({ summary: "Create a promotion (DRAFT, version 1)" })
  create(@CurrentUser() u: JwtUser, @Body() b: VersionBody) { this.canWrite(u); return this.svc.create(this.actor(u), b); }
  @Post(":id/versions") @ApiOperation({ summary: "Edit = a new version and a new review (never edited in place)" })
  version(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: VersionBody) { this.canWrite(u); return this.svc.newVersion(this.actor(u), id, b); }
  @Post(":id/submit") @HttpCode(200) @ApiOperation({ summary: "Submit for review: the content guard runs first; blocked wording is refused with the hits" })
  submit(@CurrentUser() u: JwtUser, @Param("id") id: string) { this.canWrite(u); return this.svc.submit(this.actor(u), id); }
  @Post(":id/pause") @HttpCode(200) @ApiOperation({ summary: "Pause at any time (reservations already held keep their discount)" })
  pause(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() b: PausePromotionDto) { this.canWrite(u); return this.svc.pause(this.actor(u), id, b?.reason); }
  @Post(":id/resume") @HttpCode(200) @ApiOperation({ summary: "Resume a paused promotion inside its window" })
  resume(@CurrentUser() u: JwtUser, @Param("id") id: string) { this.canWrite(u); return this.svc.resume(this.actor(u), id); }
  @Post(":id/archive") @HttpCode(200) @ApiOperation({ summary: "Archive a finished or unused promotion (refused while a reservation is open)" })
  archive(@CurrentUser() u: JwtUser, @Param("id") id: string) { this.canWrite(u); return this.svc.archive(this.actor(u), id); }
}
