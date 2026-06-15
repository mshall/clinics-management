import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { OperationDocumentKind } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AddOperationMedicationDto {
  @ApiProperty({ example: "Metformin 500mg" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  drugName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  dosage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  route?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  frequency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  duration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

export class OperationDocumentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: OperationDocumentKind })
  kind!: OperationDocumentKind;

  @ApiPropertyOptional()
  description!: string | null;

  @ApiProperty()
  originalFileName!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  createdAt!: string;
}

export class OperationMedicationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  drugName!: string;

  @ApiPropertyOptional()
  dosage!: string | null;

  @ApiPropertyOptional()
  route!: string | null;

  @ApiPropertyOptional()
  frequency!: string | null;

  @ApiPropertyOptional()
  duration!: string | null;

  @ApiPropertyOptional()
  instructions!: string | null;
}
