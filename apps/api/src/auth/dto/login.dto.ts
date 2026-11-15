import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "physician@kiorly.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "demo" })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiPropertyOptional({ description: "Six-digit TOTP code when MFA is enabled" })
  @IsOptional()
  @IsString()
  mfaCode?: string;
}
