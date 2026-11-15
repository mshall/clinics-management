import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateTenantPaymentChannelDto {
  @ApiProperty({ description: "Display name for staff (e.g. Clinic InstaPay)" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: "Bank or wallet account number patients should pay to" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  accountNumber?: string;

  @ApiPropertyOptional({ description: "Mobile number for wallet / transfer collection" })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  mobileNumber?: string;
}