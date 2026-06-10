import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { BASE_CURRENCIES } from "../../common/base-currencies";
import { CreateClinicDto } from "../../clinics/dto/create-clinic.dto";
import { CreateTenantGroupAdminDto } from "./create-tenant-group-admin.dto";

export class CreateTenantDto {
  @ApiProperty({ example: "Acme Clinic Group", description: "Organization name (English)" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: "مجموعة عيادات أكم", description: "Organization name (Arabic)" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameAr!: string;

  @ApiPropertyOptional({ default: "AED", enum: BASE_CURRENCIES })
  @IsOptional()
  @IsString()
  @IsIn(BASE_CURRENCIES)
  baseCurrency?: string;

  @ApiPropertyOptional({ default: "en" })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  defaultLocale?: string;

  @ApiPropertyOptional({
    description: "Initial group administrator for this organization (email, password, display name)",
    type: CreateTenantGroupAdminDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTenantGroupAdminDto)
  groupAdmin?: CreateTenantGroupAdminDto;

  @ApiPropertyOptional({
    description: "Optional first parent clinic (HQ) — same fields as organization admin clinic onboarding",
    type: CreateClinicDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateClinicDto)
  initialClinic?: CreateClinicDto;
}
