import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { ClinicianVerificationService } from "./clinician-verification.service";
import { SetProfessionDto } from "./dto/set-profession.dto";

@ApiTags("clinicians")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("clinicians")
export class ProfessionController {
  constructor(private readonly service: ClinicianVerificationService) {}

  @Patch(":userId/profession")
  @ApiOperation({ summary: "PRSOP01/03: set a clinician's profession (forces re-verification; ASSISTANT needs a named supervisor)" })
  setProfession(@CurrentUser() user: JwtUser, @Param("userId") userId: string, @Body() body: SetProfessionDto) {
    return this.service.setProfession(user, userId, body.profession, body.supervisorUserId ?? null);
  }
}
