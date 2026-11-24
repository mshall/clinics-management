import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `requestPatient` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ExportsRequestPatientBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  patientId!: string;
}

/** Body of `startOffboarding` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ExportsStartOffboardingBodyDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  legalHold?: boolean;
}

/** Body of `legalHold` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ExportsLegalHoldBodyDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  legalHold!: boolean;
}
