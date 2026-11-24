import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `putRecordShareConsent` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class RecordShareClinicPutRecordShareConsentBodyDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  consents!: { scope: string; granted: boolean }[];
}
