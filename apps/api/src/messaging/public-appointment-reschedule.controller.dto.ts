import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `apply` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PublicAppointmentRescheduleApplyBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  startsAt?: string;
}
