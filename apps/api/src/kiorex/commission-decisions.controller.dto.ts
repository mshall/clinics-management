import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `override` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class CommissionDecisionsOverrideBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  appointmentId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}
