import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { hasAnyRoleInSet } from "../common/effective-roles";
import {
  ProviderCredentialsService,
  type CreateProviderCredentialDto,
} from "./provider-credentials.service";

@ApiTags("provider-credentials")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement("eta_receipts")
@Controller("admin/provider-credentials")
export class ProviderCredentialsController {
  constructor(private readonly credentials: ProviderCredentialsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.credentials.listForTenant(requireTenantId(user));
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() body: CreateProviderCredentialDto) {
    const allowed: Set<UserRole> = new Set([UserRole.GROUP_ADMIN, UserRole.GROUP_SUPERVISOR, UserRole.CLINIC_ADMIN]);
    if (!hasAnyRoleInSet(user, allowed)) throw new ForbiddenException();
    return this.credentials.create(requireTenantId(user), body);
  }

  @Delete(":id")
  remove(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    const allowed: Set<UserRole> = new Set([UserRole.GROUP_ADMIN, UserRole.GROUP_SUPERVISOR]);
    if (!hasAnyRoleInSet(user, allowed)) throw new ForbiddenException();
    return this.credentials.remove(requireTenantId(user), id);
  }
}