import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Allow, IsOptional } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `put` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class UserPreferencesPutBodyDto {
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @Allow()
  keys?: unknown;
}
