import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FinancialVisibilityOverride, PlanKey, SubscriptionStatus, UserRole } from "@prisma/client";

export class MoneyVisibilityOverridesDto {
  @ApiProperty({ enum: FinancialVisibilityOverride })
  operations!: FinancialVisibilityOverride;

  @ApiProperty({ enum: FinancialVisibilityOverride })
  encounters!: FinancialVisibilityOverride;

  @ApiProperty({ enum: FinancialVisibilityOverride })
  appointments!: FinancialVisibilityOverride;
}

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

  @ApiProperty({ type: String, nullable: true, description: "Null for platform super administrators" })
  tenantId!: string | null;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ type: [String], enum: UserRole, description: "Primary + additional roles" })
  roles!: UserRole[];

  @ApiProperty({ type: [String], enum: UserRole })
  additionalRoles!: UserRole[];

  @ApiProperty({ description: "Single tenant owner (billing / ownership transfer)" })
  isTenantOwner!: boolean;

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
    type: String,
    description: "Organization base currency (tenant default for clinics that inherit org settings)",
    nullable: true,
  })
  tenantBaseCurrency?: string | null;

  @ApiPropertyOptional({
    description: "True for PLATFORM_SUPER_ADMIN role or when email is listed in PLATFORM_SUPER_ADMIN_EMAILS",
  })
  platformSuperAdmin?: boolean;

  @ApiPropertyOptional({ description: "Whether the user uploaded a profile picture" })
  hasAvatar?: boolean;

  @ApiPropertyOptional({ description: "Whether TOTP MFA is enabled for this account" })
  mfaEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Privileged role must complete MFA setup before using the app (token allows /auth/mfa/* only)",
  })
  mfaEnrollmentRequired?: boolean;

  @ApiPropertyOptional({
    type: [EmployeePrivilegeGrantSummaryDto],
    description: "Clinics where the user is assigned as HR (full clinic-scoped HR permissions)",
  })
  employeePrivilegeGrants?: EmployeePrivilegeGrantSummaryDto[];

  @ApiPropertyOptional({
    type: MoneyVisibilityOverridesDto,
    description: "Per-user override for showing money on operations, encounters, and appointments",
  })
  moneyVisibilityOverrides?: MoneyVisibilityOverridesDto;

  @ApiPropertyOptional({
    description: "Resolved SaaS plan for the organization",
    type: "object",
    properties: { key: { enum: Object.values(PlanKey) }, status: { enum: Object.values(SubscriptionStatus) } },
  })
  plan?: { key: PlanKey; status: SubscriptionStatus };

  @ApiPropertyOptional({
    description: "Merged plan entitlements and ops overrides for the tenant",
    type: "object",
    additionalProperties: true,
  })
  entitlements?: Record<string, unknown>;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiPropertyOptional({ description: "Rotating refresh token (ON-02)" })
  refreshToken?: string;

  @ApiPropertyOptional()
  sessionId?: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
