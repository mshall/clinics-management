import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `interest` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class KiorexFrontDoorInterestBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;
}

/** Body of `start` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class KiorexFrontDoorStartBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;
}
