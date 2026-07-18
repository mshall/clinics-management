import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class CreateInvoiceLineDto {
  @ApiProperty({ description: "Purpose / service description" })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  purpose!: string;

  @ApiProperty({ description: "Amount paid for this line" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountPaid!: number;
}

export class CreateInvoiceDto {
  @ApiPropertyOptional({ description: "Link invoice to an encounter" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  encounterId?: string;

  @ApiPropertyOptional({ description: "Link invoice to an operation" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  operationId?: string;

  @ApiProperty({ type: [CreateInvoiceLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];
}
