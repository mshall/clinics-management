import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { CreateClinicDto } from "../../clinics/dto/create-clinic.dto";
import { CreateTenantGroupAdminDto } from "./create-tenant-group-admin.dto";

export class CreateTenantDto {
  @ApiProperty({ example: "Acme Clinic Group" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ default: "AED" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
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
