import { Controller, Get, Header, Param, Post, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { NavTabAccessService } from "../user-nav-tabs/nav-tab-access.service";
import { ENCOUNTERS_MUTATE_ROLES, ENCOUNTERS_VIEW_ROLES } from "../user-nav-tabs/nav-tab-module-roles";
import { RxShareService } from "./rx-share.service";

@ApiTags("encounters")
@ApiBearerAuth("bearer")
@Controller("encounters")
@UseGuards(JwtAuthGuard)
export class RxShareController {
  constructor(
    private readonly rx: RxShareService,
    private readonly navTabAccess: NavTabAccessService,
  ) {}

  @Post(":id/prescription/print")
  @ApiOperation({ summary: "CL-03: printable signed Rx (brand + ingredient + Arabic sig) with a fresh verification QR link" })
  @ApiOkResponse()
  async print(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    await this.navTabAccess.assertViewTab(user, "encounters", ENCOUNTERS_VIEW_ROLES, "You do not have permission to view encounters");
    return this.rx.printable(requireTenantId(user), id, user);
  }

  @Post(":id/prescription/send")
  @ApiOperation({ summary: "CL-03: send the signed Rx PDF to the patient on WhatsApp (approved template, consent-checked)" })
  @ApiOkResponse()
  async send(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    await this.navTabAccess.assertMutateTab(
      user,
      "encounters",
      ENCOUNTERS_MUTATE_ROLES,
      "You do not have permission to change encounters",
    );
    return this.rx.sendToPatient(requireTenantId(user), id, user);
  }
}

@ApiTags("public")
@Controller("public/rx/verify")
export class PublicRxVerifyController {
  constructor(private readonly rx: RxShareService) {}

  @Get(":token")
  @Header("Cache-Control", "no-store")
  @Header("X-Robots-Tag", "noindex")
  @ApiOperation({ summary: "CL-03: pharmacy verification of a signed prescription (no auth; no more PHI than the printed Rx)" })
  @ApiOkResponse()
  verify(@Param("token") token: string) {
    return this.rx.verify(token);
  }

  @Get(":token/pdf")
  @Header("Cache-Control", "no-store")
  @Header("X-Robots-Tag", "noindex")
  @ApiOperation({ summary: "CL-03: signed prescription PDF behind the WhatsApp document link" })
  @ApiProduces("application/pdf")
  async pdf(@Param("token") token: string) {
    const { pdf, filename } = await this.rx.pdf(token);
    return new StreamableFile(pdf, {
      type: "application/pdf",
      disposition: `inline; filename="${filename}"`,
    });
  }
}
