import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateTenantInitialClinicDto {
  @ApiProperty({ example: "Acme Medical Center — HQ" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameEn!: string;

  @ApiProperty({ example: "مركز أكمي الطبي — المقر" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameAr!: string;

  @ApiProperty({ example: "Dubai" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @ApiPropertyOptional({ default: "AE" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  country?: string;
}
