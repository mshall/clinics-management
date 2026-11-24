import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Allow, IsOptional } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `putSignInMethod` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class AdminPutSignInMethodBodyDto {
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @Allow()
  defaultSignInMethod?: unknown;
}
