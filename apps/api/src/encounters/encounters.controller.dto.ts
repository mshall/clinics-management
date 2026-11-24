import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `amend` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class EncountersAmendBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  reason!: string;
}
