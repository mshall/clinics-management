import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { PutProviderProfileDto } from "./dto/put-provider-profile.dto";
import { MarketplaceProviderProfileService } from "./marketplace-provider-profile.service";

@ApiTags("marketplace")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("marketplace-listings")
export class MarketplaceListingsProfileController {
  constructor(private readonly profiles: MarketplaceProviderProfileService) {}

  @Get(":id/profile")
  @ApiOperation({ summary: "Kiorex provider profile editor payload" })
  getProfile(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.profiles.getEditor(user, id);
  }

  @Put(":id/profile")
  @ApiOperation({ summary: "Update Kiorex provider profile" })
  putProfile(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: PutProviderProfileDto) {
    return this.profiles.putProfile(user, id, body);
  }

  @Post(":id/profile/photo")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadPhoto(@CurrentUser() user: JwtUser, @Param("id") id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.profiles.uploadPhoto(user, id, file);
  }
}