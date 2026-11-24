import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `recordConsent` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ComplianceRecordConsentBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  signerName?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  signedOnTablet?: boolean;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  ipAddress?: string;
}
