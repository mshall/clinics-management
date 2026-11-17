import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { LegalAcceptanceService } from "./legal-acceptance.service";

@ApiTags("legal")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("legal")
export class LegalController {
  constructor(private readonly acceptance: LegalAcceptanceService) {}

  @Get("status")
  @ApiOperation({ summary: "Pending legal acceptances for current pack version" })
  status(@CurrentUser() user: JwtUser) {
    const tenantId = requireTenantId(user);
    return this.acceptance.statusForUser(user.userId, tenantId);
  }

  @Post("accept")
  @ApiOperation({ summary: "Record versioned legal acceptance" })
  accept(
    @CurrentUser() user: JwtUser,
    @Body() body: { acceptances: { document: string; version: string }[] },
    @Req() req: Request,
  ) {
    const tenantId = requireTenantId(user);
    const ip = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim();
    const items = body.acceptances ?? [];
    this.acceptance.validateAcceptanceVersions(items);
    return this.acceptance
      .recordMany(tenantId, user.userId, items, ip)
      .then(() => this.acceptance.statusForUser(user.userId, tenantId));
  }
}