import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "../../auth/current-user.decorator";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import type { JwtUser } from "../../auth/jwt-user";
import { AdminDataExplorerService } from "./admin-data-explorer.service";

@ApiTags("admin-data-explorer")
@ApiBearerAuth("bearer")
@Controller("admin/data-explorer")
@UseGuards(JwtAuthGuard)
export class AdminDataExplorerController {
  constructor(private readonly explorer: AdminDataExplorerService) {}

  @Get("tables")
  @ApiOperation({ summary: "List allowlisted tables and supported operations (group admin or platform super admin)" })
  @ApiOkResponse()
  tables(@CurrentUser() user: JwtUser) {
    return this.explorer.catalog(user);
  }

  @Get("export/sql")
  @ApiOperation({ summary: "Download selected organization entities as a single SQL file" })
  @ApiOkResponse({ description: "SQL script with INSERT statements for selected entities" })
  async exportSql(@CurrentUser() user: JwtUser, @Res() res: Response, @Query("tables") tables?: string) {
    const tableList = tables?.split(",").map((t) => t.trim()).filter(Boolean);
    const sql = await this.explorer.exportSql(user, tableList);
    const tenantId = user.tenantId ?? "org";
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="kiorly-org-${tenantId}-export.sql"`);
    res.send(sql);
  }

  @Get(":table")
  @ApiOperation({ summary: "Paginated rows for an allowlisted table" })
  @ApiOkResponse()
  list(@CurrentUser() user: JwtUser, @Param("table") table: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.explorer.list(user, table, page, pageSize);
  }

  @Get(":table/:id")
  @ApiOperation({ summary: "Single row by id" })
  @ApiOkResponse()
  getOne(@CurrentUser() user: JwtUser, @Param("table") table: string, @Param("id") id: string) {
    return this.explorer.getOne(user, table, id);
  }

  @Post(":table")
  @ApiOperation({ summary: "Create row (tables that support create only)" })
  @ApiOkResponse()
  create(@CurrentUser() user: JwtUser, @Param("table") table: string, @Body() body: Record<string, unknown>) {
    return this.explorer.create(user, table, body ?? {});
  }

  @Patch(":table/:id")
  @ApiOperation({ summary: "Partial update for allowlisted fields" })
  @ApiOkResponse()
  patch(@CurrentUser() user: JwtUser, @Param("table") table: string, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.explorer.patch(user, table, id, body ?? {});
  }

  @Delete(":table/:id")
  @ApiOperation({ summary: "Delete row (tables that support delete only)" })
  @ApiOkResponse()
  remove(@CurrentUser() user: JwtUser, @Param("table") table: string, @Param("id") id: string) {
    return this.explorer.remove(user, table, id);
  }
}
