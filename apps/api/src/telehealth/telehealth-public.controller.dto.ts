import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Allow, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `post` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class TelehealthPublicPostBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @Allow()
  payload?: unknown;
}

/** Body of `mode` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class TelehealthPublicModeBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  mode?: string;
}
