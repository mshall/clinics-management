import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthUserDto, LoginResponseDto } from "../common/dto/auth-responses.dto";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { JwtUser } from "./jwt-user";

const AVATAR_UPLOAD_LIMIT = 5 * 1024 * 1024;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Exchange credentials for a JWT" })
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Current user profile" })
  @ApiOkResponse({ type: AuthUserDto })
  me(@CurrentUser() user: JwtUser) {
    return this.auth.me(user.userId, user.tenantId);
  }

  @Get("me/avatar")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Download your profile picture" })
  @ApiOkResponse({ description: "Binary image stream" })
  async getMyAvatar(@CurrentUser() user: JwtUser): Promise<StreamableFile> {
    const meta = await this.auth.getMyAvatarMeta(user.userId, user.tenantId);
    const stream = await this.auth.openAvatarReadStream(meta.storageKey);
    return new StreamableFile(stream, { type: meta.mimeType });
  }

  @Post("me/avatar")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Upload or replace your profile picture (image, max 5MB)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary", description: "Profile picture" },
      },
      required: ["file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_UPLOAD_LIMIT },
    }),
  )
  @ApiOkResponse({ schema: { properties: { ok: { type: "boolean" }, hasAvatar: { type: "boolean" } } } })
  uploadMyAvatar(@CurrentUser() user: JwtUser, @UploadedFile() file?: Express.Multer.File) {
    return this.auth.attachMyAvatar(user.userId, user.tenantId, file);
  }

  @Delete("me/avatar")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Remove your profile picture" })
  @ApiOkResponse({ schema: { properties: { ok: { type: "boolean" }, hasAvatar: { type: "boolean" } } } })
  removeMyAvatar(@CurrentUser() user: JwtUser) {
    return this.auth.removeMyAvatar(user.userId, user.tenantId);
  }

  @Patch("me/password")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Change your own password" })
  @ApiOkResponse({ schema: { properties: { ok: { type: "boolean", example: true } } } })
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.userId, user.tenantId, dto.currentPassword, dto.newPassword);
  }
}
