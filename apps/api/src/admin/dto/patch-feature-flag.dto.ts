import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class PatchFeatureFlagDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
