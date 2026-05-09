import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

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
    description: "True when this user's email is listed in PLATFORM_SUPER_ADMIN_EMAILS (data explorer, all tenants)",
  })
  platformSuperAdmin?: boolean;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
