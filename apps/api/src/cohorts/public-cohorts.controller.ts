import { Controller, Get, Header, Param } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { CohortService } from "./cohort.service";

@ApiTags("public")
@Controller("public/cohorts")
export class PublicCohortsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cohorts: CohortService,
  ) {}

  @Get(":key/remaining")
  @Header("Cache-Control", "public, max-age=60")
  @ApiOperation({ summary: "PL-09 — founding cohort seats remaining" })
  @ApiOkResponse()
  async remaining(@Param("key") key: string) {
    return this.cohorts.remainingSlots(key.trim(), this.prisma);
  }
}