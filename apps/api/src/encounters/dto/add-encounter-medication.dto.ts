import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AddEncounterMedicationDto {
  @ApiProperty({ example: "Augmentin 1g tablets" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  drugName!: string;

  @ApiPropertyOptional({ description: "Linked Egyptian drug catalog product (CL-01)" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  drugProductId?: string;

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

  @ApiPropertyOptional({ description: "Required when CL-02 alerts are major or contraindicated" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  safetyOverrideReason?: string;
}
