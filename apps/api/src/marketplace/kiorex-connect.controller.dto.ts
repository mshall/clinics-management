import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `consent` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class KiorexConnectConsentBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;

  @ApiProperty({ type: String })
  @IsString()
  termsVersion!: string;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  feeAcknowledged!: boolean;
}

/** Body of `request` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class KiorexConnectRequestBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  enrolmentCode?: string;
}

/** Body of `refresh` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class KiorexConnectRefreshBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;
}
