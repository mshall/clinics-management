import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `setSchedule` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class SplitPaymentsSetScheduleBodyDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  rows!: { dueOn: string; amount: number }[];
}
