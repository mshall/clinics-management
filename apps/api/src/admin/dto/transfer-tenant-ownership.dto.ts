import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class TransferTenantOwnershipDto {
  @ApiProperty({ description: "User id of the next tenant owner" })
  @IsString()
  @MaxLength(64)
  toUserId!: string;

  @ApiPropertyOptional({ description: "TOTP or recovery code (required when caller has MFA enabled)" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  mfaCode?: string;
}