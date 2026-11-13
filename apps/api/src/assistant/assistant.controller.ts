import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { AssistantService } from "./assistant.service";
import { AssistantChatDto, AssistantChatResponseDto, AssistantContextDto } from "./dto/assistant-chat.dto";

@ApiTags("assistant")
@ApiBearerAuth("bearer")
@Controller("assistant")
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get("context")
  @ApiOperation({ summary: "AI assistant greeting and prompts for the current user" })
  @ApiOkResponse({ type: AssistantContextDto })
  getContext(@CurrentUser() user: JwtUser, @Query("locale") locale?: string) {
    return this.assistant.getContext(user, locale);
  }

  @Post("chat")
  @ApiOperation({ summary: "Send a message to the role-aware AI assistant" })
  @ApiOkResponse({ type: AssistantChatResponseDto })
  chat(@CurrentUser() user: JwtUser, @Body() body: AssistantChatDto) {
    return this.assistant.chat(user, body.message, body.locale);
  }
}
