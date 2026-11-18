import { Controller, Get, Param, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { MonthlyStatementService } from "./monthly-statement.service";

@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("billing/statements")
export class MonthlyStatementController {
  constructor(private readonly statements: MonthlyStatementService) {}

  @Get()
  @ApiOperation({ summary: "List monthly Kiorly statements (one per invoiced period)" })
  list(@CurrentUser() user: JwtUser) {
    return this.statements.listForTenant(user, requireTenantId(user));
  }

  @Get(":period")
  @ApiOperation({ summary: "Monthly statement for a period (YYYY-MM); bilingual PDF via ?format=pdf" })
  @ApiProduces("application/json", "application/pdf")
  async getOne(
    @CurrentUser() user: JwtUser,
    @Param("period") period: string,
    @Query("format") format?: string,
  ) {
    const tenantId = requireTenantId(user);
    if (format?.toLowerCase() === "pdf") {
      const { pdf, filename } = await this.statements.renderPdfForTenant(user, tenantId, period);
      return new StreamableFile(pdf, {
        type: "application/pdf",
        disposition: `inline; filename="${filename}"`,
      });
    }
    return this.statements.getForTenant(user, tenantId, period);
  }
}
