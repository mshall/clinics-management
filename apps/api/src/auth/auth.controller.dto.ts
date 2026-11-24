import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `refresh` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class AuthRefreshBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  refreshToken!: string;
}

/** Body of `forgotPassword` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class AuthForgotPasswordBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  phone?: string;
}

/** Body of `resetPassword` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class AuthResetPasswordBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ type: String })
  @IsString()
  newPassword!: string;
}

/** Body of `otpRequest` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class AuthOtpRequestBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  phone!: string;
}

/** Body of `otpVerify` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class AuthOtpVerifyBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  phone!: string;

  @ApiProperty({ type: String })
  @IsString()
  code!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  mfaCode?: string;
}

/** Body of `confirmMfa` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class AuthConfirmMfaBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  secret!: string;

  @ApiProperty({ type: String })
  @IsString()
  code!: string;
}

/** Body of `disableMfa` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class AuthDisableMfaBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  password!: string;

  @ApiProperty({ type: String })
  @IsString()
  code!: string;
}

/** Body of `enableWhatsAppMfa` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class AuthEnableWhatsAppMfaBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  password!: string;
}

/** Body of `whatsappMfaChallenge` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class AuthWhatsappMfaChallengeBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  userId!: string;
}

/** Body of `regenerateMfaRecovery` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class AuthRegenerateMfaRecoveryBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  password!: string;

  @ApiProperty({ type: String })
  @IsString()
  code!: string;
}
