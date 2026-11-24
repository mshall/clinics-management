import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `callTicket` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class FrontDeskCallTicketBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  ticketNumber!: number;
}

/** Body of `putPrintSettings` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class FrontDeskPutPrintSettingsBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;

  @ApiProperty({ type: String })
  @IsString()
  thermalPrinterProfileId!: string;
}

/** Body of `printReceipt` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class FrontDeskPrintReceiptBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;

  @ApiProperty({ type: String })
  @IsString()
  patientName!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  lines?: { label: string; amount: string }[];

  @ApiProperty({ type: String })
  @IsString()
  total!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ enum: ["en", "ar"] })
  @IsOptional()
  @IsIn(["en", "ar"])
  locale?: "en" | "ar";
}
