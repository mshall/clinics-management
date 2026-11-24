import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsIn, IsObject, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `requestOtp` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PublicSignupRequestOtpBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  phone!: string;

  @ApiProperty({ type: String })
  @IsString()
  market!: string;
}

/** Body of `verify` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PublicSignupVerifyBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  phone!: string;

  @ApiProperty({ type: String })
  @IsString()
  code!: string;

  @ApiProperty({ type: String })
  @IsString()
  market!: string;
}

/** Body of `complete` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PublicSignupCompleteBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  signupToken!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  profile!: { displayName: string; email: string; password: string };

  @ApiProperty({ type: String })
  @IsString()
  specialty!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  clinic!: {
        nameEn: string;
        nameAr?: string;
        city: string;
        addressEn?: string;
        addressAr?: string;
        locationUrl?: string;
      };

  @ApiProperty({ type: String })
  @IsString()
  planKey!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  salesRepCode?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  referralCode?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  ref?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  rep?: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  legalAcceptances?: { document: string; version: string }[];

  @ApiPropertyOptional({ enum: ["CLINIC", "NURSE"] })
  @IsOptional()
  @IsIn(["CLINIC", "NURSE"])
  edition?: "CLINIC" | "NURSE";

  @ApiPropertyOptional({ enum: ["SOLO", "AGENCY"] })
  @IsOptional()
  @IsIn(["SOLO", "AGENCY"])
  nurseKind?: "SOLO" | "AGENCY";
}
