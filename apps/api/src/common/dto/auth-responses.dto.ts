import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

export class EmployeePrivilegeGrantSummaryDto {
  @ApiProperty()
  clinicId!: string;

  @ApiProperty()
  canManageEmployees!: boolean;

  @ApiProperty()
  canArchiveEmployees!: boolean;

  @ApiProperty()
  hrProvisionLogin!: boolean;
}

export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true, description: "Null for platform super administrators" })
  tenantId!: string | null;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiPropertyOptional({
    description: "Subset of sidebar tabs allowed for this user; omit or null = role defaults",
    type: [String],
    nullable: true,
  })
  navTabKeys?: string[] | null;

  @ApiPropertyOptional({
    description: "Organization override for this user's role sidebar tabs; omit or null = platform role defaults",
    type: [String],
    nullable: true,
  })
  roleNavTabKeys?: string[] | null;

  @ApiPropertyOptional({
    description: "True for PLATFORM_SUPER_ADMIN role or when email is listed in PLATFORM_SUPER_ADMIN_EMAILS",
  })
  platformSuperAdmin?: boolean;

  @ApiPropertyOptional({ description: "Whether the user uploaded a profile picture" })
  hasAvatar?: boolean;

  @ApiPropertyOptional({
    type: [EmployeePrivilegeGrantSummaryDto],
    description: "Clinics where the user is assigned as HR (full clinic-scoped HR permissions)",
  })
  employeePrivilegeGrants?: EmployeePrivilegeGrantSummaryDto[];
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
