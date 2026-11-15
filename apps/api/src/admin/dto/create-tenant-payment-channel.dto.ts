import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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

  @ApiProperty({
    description: "ECMAScript regex for transfer reference validation on this channel",
    example: "^[A-Za-z0-9][A-Za-z0-9\\-_.]{5,31}$",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  referencePattern!: string;

  @ApiProperty({
    description: "ETA fiscal payment method code on receipts (C cash, V card, O other/transfer)",
    enum: ["C", "V", "O"],
    default: "O",
  })
  @IsString()
  @IsIn(["C", "V", "O"])
  fiscalPaymentCode!: string;
}