import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Minimal identity for a first-time booking without a finished patient chart. */
export class ProvisionalPatientDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstNameEn!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastNameEn!: string;

  @ApiProperty({ example: "+201001234567" })
  @IsString()
  @MinLength(5)
  @MaxLength(40)
  phone!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstNameAr?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastNameAr?: string;
}
