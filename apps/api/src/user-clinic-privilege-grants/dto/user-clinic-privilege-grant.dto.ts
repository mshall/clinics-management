import { ApiProperty } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

export class UserClinicPrivilegeGrantDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  clinicId!: string;

  @ApiProperty()
  clinicNameEn!: string;

  @ApiProperty()
  templateEmployeeId!: string;

  @ApiProperty()
  templateEmployeeName!: string;

  @ApiProperty({ enum: UserRole })
  templateUserRole!: UserRole;

  @ApiProperty()
  canManageEmployees!: boolean;

  @ApiProperty()
  canArchiveEmployees!: boolean;

  @ApiProperty()
  hrProvisionLogin!: boolean;
}

export class PrivilegeTemplateEmployeeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  jobTitle!: string;

  @ApiProperty({ enum: UserRole })
  userRole!: UserRole;

  @ApiProperty()
  canManageEmployees!: boolean;

  @ApiProperty()
  canArchiveEmployees!: boolean;

  @ApiProperty()
  hrProvisionLogin!: boolean;
}
