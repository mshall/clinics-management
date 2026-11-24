import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ClinicalSpecialty } from "@prisma/client";
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { IsBoundedJson } from "../common/bounded-json";
import { Lenient } from "../common/lenient-dto";

/** Body of `POST clinical/form-templates`. The section tree is user-designed, so it is a bounded JSON object (size, depth, key count, string length) rather than a fixed shape. */
@Lenient()
export class ClinicalUpsertTemplateBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) id?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) clinicId!: string;
  @ApiProperty({ enum: ClinicalSpecialty }) @IsEnum(ClinicalSpecialty) specialty!: ClinicalSpecialty;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) customSpecialtyLabelEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) customSpecialtyLabelAr?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiProperty({ type: Object }) @IsBoundedJson({ maxBytes: 512 * 1024, maxDepth: 12, maxKeys: 5000, maxStringLength: 5000 }) sectionsJson!: unknown;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;
}
