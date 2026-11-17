import { Controller, Get, Param, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { KiorlyInvoicesService } from "./kiorly-invoices.service";

@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("billing")
export class KiorlyInvoicesController {
  constructor(private readonly kiorlyInvoices: KiorlyInvoicesService) {}

  @Get("invoices")
  @ApiOperation({ summary: "List Kiorly SaaS invoices for the organization" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.kiorlyInvoices.listForTenant(
      user,
      requireTenantId(user),
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @Get("invoices/:id")
  @ApiOperation({ summary: "Get one Kiorly invoice (optional PDF via ?format=pdf)" })
  @ApiProduces("application/json", "application/pdf")
  async getOne(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Query("format") format?: string,
  ) {
    const tenantId = requireTenantId(user);
    if (format?.toLowerCase() === "pdf") {
      const pdf = await this.kiorlyInvoices.renderPdf(tenantId, id);
      const meta = await this.kiorlyInvoices.getOneForTenant(user, tenantId, id);
      return new StreamableFile(pdf, {
        type: "application/pdf",
        disposition: `inline; filename="${meta.number}.pdf"`,
      });
    }
    return this.kiorlyInvoices.getOneForTenant(user, tenantId, id);
  }

}