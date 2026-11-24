import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `accept` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class LegalAcceptBodyDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  acceptances!: { document: string; version: string }[];
}
