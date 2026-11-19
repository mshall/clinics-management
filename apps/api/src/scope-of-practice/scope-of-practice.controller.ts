import { Controller, Get, NotFoundException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { ScopeOfPracticeService } from "./scope-of-practice.service";

@ApiTags("scope-of-practice")
@ApiBearerAuth("bearer")
@Controller("scope-of-practice")
@UseGuards(JwtAuthGuard)
export class ScopeOfPracticeController {
  constructor(private readonly scope: ScopeOfPracticeService) {}

  @Get("me")
  @ApiOperation({ summary: "PRSOP: my profession and the capabilities its scope allows (the web hides what is not allowed; the server enforces)" })
  async me(@CurrentUser() user: JwtUser) {
    const d = await this.scope.describeForUser(user.userId);
    if (!d) throw new NotFoundException("User not found");
    return d;
  }
}
