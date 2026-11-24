import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `putTypeOverrides` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class SchedulingPutTypeOverridesBodyDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  overrides!: Array<{ appointmentTypeId: string; durationMinutes?: number | null; feeAmount?: number | null }>;
}
