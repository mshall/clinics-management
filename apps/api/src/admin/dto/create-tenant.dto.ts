import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { CreateTenantGroupAdminDto } from "./create-tenant-group-admin.dto";
import { CreateTenantInitialClinicDto } from "./create-tenant-initial-clinic.dto";

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
    description: "Optional first parent clinic (HQ) created with the organization",
    type: CreateTenantInitialClinicDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTenantInitialClinicDto)
  initialClinic?: CreateTenantInitialClinicDto;
}
