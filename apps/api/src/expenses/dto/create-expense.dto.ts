import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ExpenseStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateExpenseDto {
  @ApiProperty()
  @IsString()
  clinicId!: string;

  @ApiProperty({ example: "UTILITIES" })
  @IsString()
  @MaxLength(64)
  category!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ example: "AED" })
  @IsString()
  @MaxLength(8)
  currency!: string;

  @ApiProperty({ example: "2025-05-01T12:00:00.000Z" })
  @IsDateString()
  incurredAt!: string;

  @ApiPropertyOptional({ enum: ExpenseStatus })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;
}
