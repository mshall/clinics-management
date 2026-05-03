import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AddDiagnosisDto {
  @ApiProperty({ example: "I10" })
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  icd10Code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  descriptionEn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionAr?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
