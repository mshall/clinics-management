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

  @ApiPropertyOptional({ description: "Market pack (country) — defaults to Egypt when omitted" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  marketId?: string;

  @ApiPropertyOptional({ description: "Deployment cell / host zone — defaults from market (Frankfurt for Egypt)" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deploymentCell?: string;

  @ApiPropertyOptional({ enum: BASE_CURRENCIES, description: "Overrides market default currency when set" })
  @IsOptional()
  @IsString()
  @IsIn(BASE_CURRENCIES)
  baseCurrency?: string;

  @ApiPropertyOptional({ default: "en" })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  defaultLocale?: string;

  @ApiPropertyOptional({ description: "Default tax registration for new clinics (country-specific)" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  defaultTaxRegistrationNumber?: string;

  @ApiPropertyOptional({ description: "Default facility license applied when provisioning the first clinic" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultLicenseNumber?: string;

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
